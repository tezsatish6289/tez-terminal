/**
 * GET /api/freedombot/levels/score?scope=&symbol=
 *
 * Cheap, LLM-free composite "setup score" for a symbol — powers the Atlas badge
 * on the chart toolbar (mirrors the news-sentiment badge). Reads the same stored
 * zone doc Fynn uses, derives the directional read, and scores the setup in the
 * direction the data points. No option chain, no Gemini call.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { stockDocId } from "@/lib/equity-zones-store";
import { normalizeStockSymbol } from "@/lib/equity-zones-on-demand";
import { isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import { loadIvHistory } from "@/lib/iv-history";
import { ivPercentile } from "@/lib/zones/vol-regime";
import { fetchPvtSlope } from "@/lib/levels/pvt-signal";
import { getOpenSrEventAnchorSec } from "@/lib/sr-audit/open-event-anchor";
import {
  computeDirection,
  scoreDirectionalSetup,
  type ScoreInputs,
} from "@/lib/levels/strategy-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function oiChangePct(oi: number | null, change: number | null): number | null {
  if (oi == null || change == null) return null;
  const prior = oi - change;
  if (prior <= 0) return null;
  return Math.round((change / prior) * 1000) / 10;
}

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const m = expiry.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const target = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "index" ? "index" : searchParams.get("scope") === "stock" ? "stock" : null;
  const rawSymbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!scope || !rawSymbol) {
    return NextResponse.json({ ok: false, error: "Missing scope or symbol" }, { status: 400 });
  }

  const db = getAdminFirestore();
  let symbol = rawSymbol;
  let docPath: string;
  if (scope === "stock") {
    symbol = normalizeStockSymbol(rawSymbol);
    if (!(await isValidFnoSymbolDb(db, symbol))) {
      return NextResponse.json({ ok: false, error: "Unknown F&O symbol" }, { status: 400 });
    }
    docPath = stockDocId(symbol);
  } else {
    docPath = `config/suggested_index_zones_${symbol}`;
  }

  const raw = await readDoc(docPath);
  if (!raw) {
    return NextResponse.json({ ok: false, error: "No levels yet" }, { status: 404 });
  }

  const expiry = resolveZonesExpiryFromStored(raw);
  const [ivPct, pvtSlope] = await Promise.all([
    (async () => {
      try {
        return ivPercentile((await loadIvHistory(db, symbol)).values, num(raw.atmIV));
      } catch {
        return null;
      }
    })(),
    // PVT anchored at the toe-dip: only meaningful if the symbol is sitting in a
    // cluster (has an open SR event); otherwise it abstains.
    fetchPvtSlope(scope, symbol, await getOpenSrEventAnchorSec(db, symbol)),
  ]);

  const inputs: ScoreInputs = {
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    maxPain: num(raw.maxPain),
    supportLow: num(raw.bullZoneLow),
    supportHigh: num(raw.bullZoneHigh),
    resistanceLow: num(raw.bearZoneLow),
    resistanceHigh: num(raw.bearZoneHigh),
    putWallStrike: num(raw.bullStrike),
    putWallSize: num(raw.bullOI),
    callWallStrike: num(raw.bearStrike),
    callWallSize: num(raw.bearOI),
    atmIV: num(raw.atmIV),
    ivPercentile: ivPct,
    volRegimeFlag: typeof raw.volRegimeFlag === "string" ? raw.volRegimeFlag : null,
    daysToExpiry: daysUntilExpiry(expiry),
    daysToEarnings: num(raw.daysToEarnings),
    putOiChangePct: oiChangePct(num(raw.bullOI), num(raw.bullOIChange)),
    callOiChangePct: oiChangePct(num(raw.bearOI), num(raw.bearOIChange)),
    newsScore: null,
    pvtSlope,
  };

  if (inputs.spot == null && inputs.maxPain == null) {
    return NextResponse.json({ ok: false, error: "Levels still computing" }, { status: 409 });
  }

  const direction = computeDirection(inputs);
  // Score the setup in the direction the data leans (bullish → support thesis).
  const side = direction.value >= 0 ? "support" : "resistance";
  const setup = scoreDirectionalSetup(side, inputs);

  return NextResponse.json(
    {
      ok: true,
      symbol,
      score: {
        composite: setup.composite,
        directionLabel: setup.directionLabel,
        subScores: setup.subScores,
      },
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
