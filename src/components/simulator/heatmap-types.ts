/** Shared types for Deribit zone heatmap cards (simulation grid + BTC sheet). */

export interface MaxPainEntry {
  expiry: string;
  maxPain: number;
  totalOI: number;
  dayIndex: number;
}

export interface SuggestedZonesSnapshot {
  bullStrike: number | null;
  bearStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bullExitAbove: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  bearExitBelow: number | null;
  bullOI: number | null;
  bearOI: number | null;
  bullClusterShare?: number | null;
  bearClusterShare?: number | null;
  /** Net wall OI dominance: bull vs bear picked strikes (0..1). */
  clusterOiImbalance?: number | null;
  /** Both sides picked but net gap below bot threshold. */
  clusterOiBalanced?: boolean | null;
  maxPain: number | null;
  maxPainByExpiry: MaxPainEntry[] | null;
  signalConflict: boolean | null;
  bullTpTarget: number | null;
  bullTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  bearTpTarget: number | null;
  bearTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  atmIV?: number | null;
  inPanicRegime?: boolean | null;
  halfWidthUsd?: number | null;
  maxReachUsd?: number | null;
  bullActionable?: boolean | null;
  bearActionable?: boolean | null;
  notActionableReason?: string | null;
  maxPainAnchorSpanUsd?: number | null;
  bullLocked?: boolean | null;
  bearLocked?: boolean | null;
  btcPrice?: number | null;
  deribitIndexPrice?: number | null;
  computedAt?: string;
}

function readNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce a Firestore config doc into a typed snapshot (handles string numbers). */
export function normalizeSuggestedZones(
  raw: Record<string, unknown> | null | undefined,
): SuggestedZonesSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    bullStrike: readNum(raw.bullStrike),
    bearStrike: readNum(raw.bearStrike),
    bullZoneLow: readNum(raw.bullZoneLow),
    bullZoneHigh: readNum(raw.bullZoneHigh),
    bullExitAbove: readNum(raw.bullExitAbove),
    bearZoneLow: readNum(raw.bearZoneLow),
    bearZoneHigh: readNum(raw.bearZoneHigh),
    bearExitBelow: readNum(raw.bearExitBelow),
    bullOI: readNum(raw.bullOI),
    bearOI: readNum(raw.bearOI),
    bullClusterShare: readNum(raw.bullClusterShare),
    bearClusterShare: readNum(raw.bearClusterShare),
    clusterOiImbalance: readNum(raw.clusterOiImbalance),
    clusterOiBalanced:
      raw.clusterOiBalanced === true ? true : raw.clusterOiBalanced === false ? false : null,
    maxPain: readNum(raw.maxPain),
    maxPainByExpiry: Array.isArray(raw.maxPainByExpiry)
      ? raw.maxPainByExpiry.map((entry, i) => {
          const e = entry as Record<string, unknown>;
          return {
            expiry: typeof e.expiry === "string" ? e.expiry : "",
            maxPain: readNum(e.maxPain) ?? 0,
            totalOI: readNum(e.totalOI) ?? 0,
            dayIndex:
              typeof e.dayIndex === "number" && Number.isFinite(e.dayIndex)
                ? e.dayIndex
                : i,
          };
        })
      : null,
    signalConflict: raw.signalConflict === true ? true : raw.signalConflict === false ? false : null,
    bullTpTarget: readNum(raw.bullTpTarget),
    bullTpConfidence:
      raw.bullTpConfidence === "HIGH" ||
      raw.bullTpConfidence === "MEDIUM" ||
      raw.bullTpConfidence === "LOW"
        ? raw.bullTpConfidence
        : null,
    bearTpTarget: readNum(raw.bearTpTarget),
    bearTpConfidence:
      raw.bearTpConfidence === "HIGH" ||
      raw.bearTpConfidence === "MEDIUM" ||
      raw.bearTpConfidence === "LOW"
        ? raw.bearTpConfidence
        : null,
    atmIV: readNum(raw.atmIV),
    inPanicRegime: raw.inPanicRegime === true ? true : raw.inPanicRegime === false ? false : null,
    halfWidthUsd: readNum(raw.halfWidthUsd),
    maxReachUsd: readNum(raw.maxReachUsd),
    bullActionable:
      raw.bullActionable === true ? true : raw.bullActionable === false ? false : null,
    bearActionable:
      raw.bearActionable === true ? true : raw.bearActionable === false ? false : null,
    notActionableReason:
      typeof raw.notActionableReason === "string" ? raw.notActionableReason : null,
    maxPainAnchorSpanUsd: readNum(raw.maxPainAnchorSpanUsd),
    bullLocked: raw.bullLocked === true ? true : raw.bullLocked === false ? false : null,
    bearLocked: raw.bearLocked === true ? true : raw.bearLocked === false ? false : null,
    btcPrice: readNum(raw.btcPrice),
    deribitIndexPrice: readNum(raw.deribitIndexPrice),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : undefined,
  };
}

export function noClusterLine(
  side: "bull" | "bear",
  s: SuggestedZonesSnapshot,
): string {
  const oi = side === "bull" ? s.bullOI : s.bearOI;
  if (oi != null && oi > 0) {
    return side === "bull"
      ? "Put OI cluster — TP room blocked"
      : "Call OI cluster — TP room blocked";
  }
  return side === "bull"
    ? "No high put cluster below spot"
    : "No high call cluster above spot";
}

export function spotFromSuggested(s: SuggestedZonesSnapshot | null): number | null {
  if (!s) return null;
  return s.deribitIndexPrice ?? s.btcPrice ?? null;
}

/**
 * Live spot lookup from the 1-min `config/exchange_prices` doc.
 *
 * This is the *fresh* price source — `suggest-zones` (the cron that
 * writes `suggested_zones_*` and thus feeds `spotFromSuggested`) only
 * runs every 15 min, so the UI was displaying stale spots between
 * runs even though `sync-prices` had written fresh BYBIT/BINANCE
 * quotes to Firestore every minute. The cockpit subscribes to
 * `config/exchange_prices` and uses this helper to pick the right
 * symbol per bot, falling back to BINANCE if BYBIT is missing.
 *
 * Shape of the doc (written by sync-prices via serializePrices):
 *   { BYBIT: { BTCUSDT: 75276, ETHUSDT: 2065, ... }, BINANCE: {...}, ... }
 */
const BOT_PERP_SYMBOL: Record<string, string> = {
  crypto: "BTCUSDT",
  btc: "BTCUSDT",
  eth: "ETHUSDT",
  sol: "SOLUSDT",
  xrp: "XRPUSDT",
};

export function liveSpotFromExchangePrices(
  raw: Record<string, unknown> | null | undefined,
  botId: string,
): number | null {
  if (!raw || typeof raw !== "object") return null;
  const symbol = BOT_PERP_SYMBOL[botId];
  if (!symbol) return null;
  for (const venue of ["BYBIT", "BINANCE", "MEXC", "HYPERLIQUID"] as const) {
    const venueMap = raw[venue];
    if (venueMap && typeof venueMap === "object") {
      const p = (venueMap as Record<string, unknown>)[symbol];
      if (typeof p === "number" && Number.isFinite(p) && p > 0) return p;
      if (typeof p === "string") {
        const n = Number(p);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }
  return null;
}

export function formatSpot(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Build a human-readable explainer for the IV badge — used as the
 * `title` tooltip on both the rail row and detail card so the same
 * math + wording surfaces everywhere.
 *
 * Implied volatility is annualized (Deribit convention — 365-day
 * year because crypto markets never close). We project that down
 * to daily / weekly / monthly 1σ expected moves so the trader can
 * eyeball the price-range intuitively. We also tag the volatility
 * regime — calm / moderate / panic — which is what gates the bot's
 * entry behavior (see deriveCockpitCardStatus + position sizing).
 */
export function formatIvExplainer(
  ivPctAnnual: number,
  spot: number | null,
  assetSymbol: string,
): string {
  const sigma = ivPctAnnual / 100;
  const regime =
    ivPctAnnual >= 70
      ? "Panic regime — new entries blocked"
      : ivPctAnnual >= 50
        ? "Elevated — position sizes shrink"
        : "Calm — entries unrestricted, sizes full";

  const lines: string[] = [
    `Implied volatility ${ivPctAnnual.toFixed(1)}% — option market's annual ±1σ forecast for ${assetSymbol}.`,
  ];

  if (spot != null && spot > 0) {
    const dailyMove = (sigma * spot) / Math.sqrt(365);
    const weeklyMove = sigma * spot * Math.sqrt(7 / 365);
    const monthlyMove = sigma * spot * Math.sqrt(30 / 365);
    const fmt = (n: number) =>
      `±$${n.toLocaleString(undefined, {
        maximumFractionDigits: n < 10 ? 2 : 0,
      })}`;
    lines.push(
      `Expected 1σ move: ${fmt(dailyMove)}/day · ${fmt(weeklyMove)}/week · ${fmt(monthlyMove)}/month.`,
    );
  }

  lines.push(`Regime: ${regime}.`);

  return lines.join("\n");
}

export function zoneStatusLine(s: SuggestedZonesSnapshot | null): string {
  if (!s) return "No zone data — refresh";
  if (s.inPanicRegime) return "Panic regime";
  if (s.bullActionable && s.bearActionable) return "Bull & bear active";
  if (s.bullActionable) return "Bull zone active";
  if (s.bearActionable) return "Bear zone active";
  const short = s.notActionableReason?.match(/^TP room (\$[\d,]+)/)?.[1];
  if (short) return `Idle · TP room ${short}`;
  if (s.notActionableReason?.startsWith("No big cluster")) return "No cluster in reach";
  return "Idle";
}
