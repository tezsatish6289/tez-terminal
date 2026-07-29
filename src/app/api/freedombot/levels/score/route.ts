/**
 * GET /api/freedombot/levels/score?scope=&symbol=
 *
 * Cheap, LLM-free Atlas setup score for a symbol. Scores **both** support (↑)
 * and resistance (↓) theses, maps each to calibrated win probability, and
 * picks a primary Atlas number (geo side if in/near a zone, else the stronger
 * thesis). Optional `side` / `tone` kept for backward compatibility.
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
import { pocRiskRewardRatio, type ZoneBands } from "@/lib/zones/zone-status";
import { deriveBubbleTone } from "@/lib/zones/bubble-tone";
import {
  atlasPrimaryScore,
  atlasProbEmphasis,
  atlasScoreBucket,
  atlasScoreSideFromTone,
  atlasSideThesis,
} from "@/lib/levels/atlas-score-calibration";

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
  const scope =
    searchParams.get("scope") === "index"
      ? "index"
      : searchParams.get("scope") === "stock"
        ? "stock"
        : null;
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

  const bands: ZoneBands = {
    spot: inputs.spot,
    bullLow: inputs.supportLow,
    bullHigh: inputs.supportHigh,
    bearLow: inputs.resistanceLow,
    bearHigh: inputs.resistanceHigh,
  };
  const bandOffset = num(raw.halfWidthUsd) ?? num(raw.halfWidth) ?? num(raw.bandOffset);
  const hasBands = bands.bullLow != null || bands.bearLow != null;
  const geoTone = deriveBubbleTone(bands, hasBands || inputs.spot != null);
  const geoSide = atlasScoreSideFromTone(geoTone);

  const rrSupport =
    inputs.maxPain != null ? pocRiskRewardRatio(bands, inputs.maxPain, bandOffset, "bull") : null;
  const rrResist =
    inputs.maxPain != null ? pocRiskRewardRatio(bands, inputs.maxPain, bandOffset, "bear") : null;

  const supportSetup = scoreDirectionalSetup("support", inputs, { riskReward: rrSupport });
  const resistSetup = scoreDirectionalSetup("resistance", inputs, { riskReward: rrResist });

  const up = atlasSideThesis(supportSetup.composite);
  const down = atlasSideThesis(resistSetup.composite);
  const primary = atlasPrimaryScore(up.score, down.score, geoSide);
  const primaryBucket = atlasScoreBucket(primary.composite);
  const pvtPresent = typeof pvtSlope === "number" && Number.isFinite(pvtSlope);
  const direction = computeDirection(inputs);

  // Backward-compat: optional side/tone still selects `score` for older clients.
  const sideParam = searchParams.get("side");
  const sideFromQuery =
    sideParam === "support" || sideParam === "resistance"
      ? sideParam
      : atlasScoreSideFromTone(searchParams.get("tone"));
  const legacySide = sideFromQuery ?? primary.side;
  const legacySetup = legacySide === "support" ? supportSetup : resistSetup;
  const legacyBucket = atlasScoreBucket(legacySetup.composite);

  return NextResponse.json(
    {
      ok: true,
      symbol,
      pvtPresent,
      lowerConfidence: !pvtPresent,
      geoSide,
      emphasis: atlasProbEmphasis(geoSide),
      atlas: {
        composite: primary.composite,
        side: primary.side,
        bucket: primaryBucket.label,
        winRatePct: primaryBucket.winRatePct,
      },
      up,
      down,
      // Legacy single-side fields (chart badge previously used these).
      side: legacySide,
      riskReward: legacySide === "support" ? rrSupport : rrResist,
      score: {
        composite: legacySetup.composite,
        directionLabel: direction.label,
        subScores: legacySetup.subScores,
      },
      calibration: {
        bucket: legacyBucket.label,
        winRatePct: legacyBucket.winRatePct,
      },
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
