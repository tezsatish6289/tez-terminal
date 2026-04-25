/**
 * Deribit-based liquidation zone suggester.
 *
 * Approach:
 *   1. Fetch all active BTC options from Deribit (free public API).
 *   2. Keep only options expiring within the next 7 days.
 *   3. Rank expiries by total OI; take the top 3 (ignores thin/noisy expiries).
 *   4. Aggregate call OI and put OI by strike across those 3 expiries.
 *   5. Bull zone  → strike with highest PUT  OI below current price
 *                   (put sellers / MM delta-hedge by buying spot → support)
 *   6. Bear zone  → strike with highest CALL OI above current price
 *                   (call sellers / MM delta-hedge by selling spot → resistance)
 *   7. Max Pain   → strike that minimises total option payout for MMs
 *                   (price tends to gravitate here into expiry)
 */

const DERIBIT_API = "https://www.deribit.com/api/v2/public";
const ZONE_HALF_WIDTH = 500; // ± $500 around the dominant strike

export interface OptionsZones {
  /** Dominant put-OI strike below price → bull support zone centre */
  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null; // = bearStrike (price reaching bear wall invalidates bull)
  bullOI:        number | null; // total put OI at bull strike (BTC contracts)

  /** Dominant call-OI strike above price → bear resistance zone centre */
  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null; // = bullStrike (price reaching bull floor invalidates bear)
  bearOI:        number | null; // total call OI at bear strike (BTC contracts)

  maxPain:       number | null; // max-pain price across top-3 expiries
  expiriesUsed:  string[];      // human-readable expiry labels
  btcPrice:      number;
  computedAt:    string;
}

// ── Deribit types ─────────────────────────────────────────────────

interface DeribitSummary {
  instrument_name:      string; // e.g. "BTC-26APR26-78000-C"
  open_interest:        number; // in BTC contracts
  expiration_timestamp: number; // ms
}

// ── Helpers ───────────────────────────────────────────────────────

function parseInstrument(name: string): {
  expiry: string; strike: number; type: "C" | "P"
} | null {
  // BTC-26APR26-78000-C
  const parts = name.split("-");
  if (parts.length !== 4) return null;
  const strike = parseInt(parts[2], 10);
  const type   = parts[3] as "C" | "P";
  if (isNaN(strike) || (type !== "C" && type !== "P")) return null;
  return { expiry: parts[1], strike, type };
}

function computeMaxPain(
  strikes: Map<number, { callOI: number; putOI: number }>,
): number | null {
  const sortedStrikes = [...strikes.keys()].sort((a, b) => a - b);
  if (sortedStrikes.length === 0) return null;

  let minPayout  = Infinity;
  let maxPainStr = sortedStrikes[0];

  for (const s of sortedStrikes) {
    let payout = 0;
    for (const [k, { callOI, putOI }] of strikes) {
      if (s > k) payout += (s - k) * callOI; // calls in-the-money
      if (s < k) payout += (k - s) * putOI;  // puts  in-the-money
    }
    if (payout < minPayout) {
      minPayout  = payout;
      maxPainStr = s;
    }
  }
  return maxPainStr;
}

// ── Core ──────────────────────────────────────────────────────────

export async function computeOptionsZones(
  currentBtcPrice: number,
): Promise<OptionsZones> {
  // 1. Fetch all BTC options from Deribit
  const url = `${DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Deribit API ${res.status}`);

  const json    = await res.json() as { result?: DeribitSummary[] };
  const all     = json.result ?? [];
  const nowMs   = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 2. Filter: expiring within 7 days, non-zero OI
  const nearTerm = all.filter(
    (s) =>
      s.open_interest > 0 &&
      s.expiration_timestamp > nowMs &&
      s.expiration_timestamp <= nowMs + sevenDaysMs,
  );

  if (nearTerm.length === 0) throw new Error("No near-term Deribit options found");

  // 3. Group by expiry, rank by total OI, keep top 3
  const byExpiry = new Map<string, { totalOI: number; items: DeribitSummary[] }>();
  for (const item of nearTerm) {
    const parsed = parseInstrument(item.instrument_name);
    if (!parsed) continue;
    const e = byExpiry.get(parsed.expiry) ?? { totalOI: 0, items: [] };
    e.totalOI += item.open_interest;
    e.items.push(item);
    byExpiry.set(parsed.expiry, e);
  }

  const topExpiries = [...byExpiry.entries()]
    .sort((a, b) => b[1].totalOI - a[1].totalOI)
    .slice(0, 3);

  const expiriesUsed = topExpiries.map(([label]) => label);

  // 4. Aggregate call/put OI by strike across top 3 expiries
  const strikes = new Map<number, { callOI: number; putOI: number }>();
  for (const [, { items }] of topExpiries) {
    for (const item of items) {
      const parsed = parseInstrument(item.instrument_name);
      if (!parsed) continue;
      const entry = strikes.get(parsed.strike) ?? { callOI: 0, putOI: 0 };
      if (parsed.type === "C") entry.callOI += item.open_interest;
      else                     entry.putOI  += item.open_interest;
      strikes.set(parsed.strike, entry);
    }
  }

  const priceIdx = currentBtcPrice;

  // 5. Bull zone: highest put OI BELOW current price
  let bullStrike: number | null = null;
  let bullOI     = 0;
  for (const [strike, { putOI }] of strikes) {
    if (strike < priceIdx && putOI > bullOI) {
      bullOI     = putOI;
      bullStrike = strike;
    }
  }

  // 6. Bear zone: highest call OI ABOVE current price
  let bearStrike: number | null = null;
  let bearOI     = 0;
  for (const [strike, { callOI }] of strikes) {
    if (strike > priceIdx && callOI > bearOI) {
      bearOI     = callOI;
      bearStrike = strike;
    }
  }

  // 7. Max pain
  const maxPain = computeMaxPain(strikes);

  return {
    bullStrike,
    bullZoneLow:   bullStrike !== null ? bullStrike - ZONE_HALF_WIDTH : null,
    bullZoneHigh:  bullStrike !== null ? bullStrike + ZONE_HALF_WIDTH : null,
    bullExitAbove: bearStrike,          // exit bull if price reaches bear wall
    bullOI:        bullOI || null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - ZONE_HALF_WIDTH : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + ZONE_HALF_WIDTH : null,
    bearExitBelow: bullStrike,          // exit bear if price reaches bull floor
    bearOI:        bearOI || null,

    maxPain,
    expiriesUsed,
    btcPrice:   currentBtcPrice,
    computedAt: new Date().toISOString(),
  };
}
