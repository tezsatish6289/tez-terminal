/**
 * POST /api/freedombot/levels/atlas/validate
 *
 * Atlas idea validation — user supplies bullish|bearish; we load zone + news +
 * OI history + PVT and run the deterministic rule engine. No LLM for the verdict.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { userHasFeature } from "@/lib/entitlements-server";
import { stockDocId } from "@/lib/equity-zones-store";
import { normalizeStockSymbol } from "@/lib/equity-zones-on-demand";
import { isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import { getLevelsNews } from "@/lib/levels/news";
import { LEVELS_NEWS_WINDOW_DAYS } from "@/lib/levels/news-types";
import { loadOiHistory } from "@/lib/oi-history";
import { loadIvHistory } from "@/lib/iv-history";
import { ivPercentile } from "@/lib/zones/vol-regime";
import { fetchPvtSlope } from "@/lib/levels/pvt-signal";
import { getOpenSrEventAnchorSec } from "@/lib/sr-audit/open-event-anchor";
import {
  validateTradeIdea,
  type IdeaBias,
} from "@/lib/levels/atlas-validate";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** News may warm from cache or generate; allow headroom. */
export const maxDuration = 45;

export const ATLAS_VALIDATE_DISCLAIMER =
  "Atlas validates your stated idea against market data — it is not investment advice and does not tell you to buy or sell.";

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

function round(n: number | null): number | null {
  if (n == null) return null;
  return n >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: { scope?: string; symbol?: string; bias?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scope = body.scope === "index" ? "index" : body.scope === "stock" ? "stock" : null;
  const biasRaw = (body.bias ?? "").trim().toLowerCase();
  const bias: IdeaBias | null =
    biasRaw === "bullish" || biasRaw === "bearish" ? biasRaw : null;
  const rawSymbol = (body.symbol ?? "").trim().toUpperCase();
  if (!scope || !rawSymbol || !bias) {
    return NextResponse.json(
      { error: "Missing scope, symbol, or bias (bullish|bearish)" },
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Sign in to use Atlas AI." }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json(
      { error: "Your session expired — please sign in again." },
      { status: 401 },
    );
  }
  if (!(await userHasFeature(uid, "atlas_ai"))) {
    return NextResponse.json(
      {
        error:
          "Atlas AI is included with the free trial, Gold, and the Day Pass. Upgrade to unlock it.",
      },
      { status: 403 },
    );
  }

  const db = getAdminFirestore();
  let docPath: string;
  let symbol = rawSymbol;

  if (scope === "stock") {
    symbol = normalizeStockSymbol(rawSymbol);
    if (!(await isValidFnoSymbolDb(db, symbol))) {
      return NextResponse.json({ error: "Unknown F&O symbol" }, { status: 400 });
    }
    docPath = stockDocId(symbol);
  } else {
    docPath = `config/suggested_index_zones_${symbol}`;
  }

  const raw = await readDoc(docPath);
  if (!raw) {
    return NextResponse.json(
      { error: "No levels available for this symbol yet. Open the chart to compute zones first." },
      { status: 404 },
    );
  }

  const spot = round(num(raw.deribitIndexPrice) ?? num(raw.btcPrice));
  const maxPain = round(num(raw.maxPain));
  if (spot == null && maxPain == null) {
    return NextResponse.json(
      { error: "Levels are still being computed for this symbol. Try again shortly." },
      { status: 409 },
    );
  }

  // Touch expiry resolve so stale docs without a resolved expiry still work.
  resolveZonesExpiryFromStored(raw);

  const [news, oiHist, ivPct, pvtSlope] = await Promise.all([
    getLevelsNews(scope, symbol, String(LEVELS_NEWS_WINDOW_DAYS)).catch(() => null),
    loadOiHistory(db, symbol),
    (async () => {
      try {
        return ivPercentile((await loadIvHistory(db, symbol)).values, num(raw.atmIV));
      } catch {
        return null;
      }
    })(),
    fetchPvtSlope(scope, symbol, await getOpenSrEventAnchorSec(db, symbol)),
  ]);

  const result = validateTradeIdea({
    symbol,
    label: typeof raw.label === "string" && raw.label ? raw.label : symbol,
    bias,
    spot,
    supportLow: round(num(raw.bullZoneLow)),
    supportHigh: round(num(raw.bullZoneHigh)),
    resistanceLow: round(num(raw.bearZoneLow)),
    resistanceHigh: round(num(raw.bearZoneHigh)),
    putOiChangePct: oiChangePct(num(raw.bullOI), num(raw.bullOIChange)),
    callOiChangePct: oiChangePct(num(raw.bearOI), num(raw.bearOIChange)),
    oiHistory: oiHist.entries,
    newsScore: news?.sentiment?.score ?? null,
    newsLabel: news?.sentiment?.label ?? null,
    newsNote: news?.sentiment?.note ?? null,
    pvtSlope,
    ivPercentile: ivPct,
    volRegimeFlag: typeof raw.volRegimeFlag === "string" ? raw.volRegimeFlag : null,
  });

  return NextResponse.json({
    ok: true,
    result,
    disclaimer: ATLAS_VALIDATE_DISCLAIMER,
  });
}
