/**
 * Deribit-based liquidation zone suggester.
 *
 * Approach:
 *   1. Fetch all active BTC options from Deribit (free public API).
 *   2. Parse expiry date from the instrument name (e.g. "BTC-26APR26-78000-C").
 *   3. Keep only options expiring within the next 7 days.
 *   4. Rank expiries by total OI; take the top 3 (ignores thin/noisy expiries).
 *   5. Aggregate call OI and put OI by strike across those 3 expiries.
 *   6. Bull zone  → strike with highest PUT  OI below current price
 *                   (put sellers / MM delta-hedge by buying spot → support)
 *   7. Bear zone  → strike with highest CALL OI above current price
 *                   (call sellers / MM delta-hedge by selling spot → resistance)
 *   8. Max Pain   → strike that minimises total option payout for MMs
 *                   (price tends to gravitate here into expiry)
 */

const DERIBIT_API    = "https://www.deribit.com/api/v2/public";
const ZONE_HALF_WIDTH = 500; // ± $500 around the dominant strike

export interface OptionsZones {
  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null; // = bearStrike
  bullOI:        number | null; // put OI in BTC contracts

  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null; // = bullStrike
  bearOI:        number | null; // call OI in BTC contracts

  maxPain:      number | null;
  expiriesUsed: string[];
  btcPrice:     number;
  computedAt:   string;
}

// ── Deribit API types ─────────────────────────────────────────────

interface DeribitSummary {
  instrument_name: string; // e.g. "BTC-26APR26-78000-C"
  open_interest:   number; // BTC contracts
}

// ── Helpers ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/**
 * Parse expiry string like "26APR26" into a UTC Date.
 * Deribit options expire at 08:00 UTC on expiry day.
 */
function parseExpiryDate(expiryStr: string): Date | null {
  const m = expiryStr.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2]];
  if (month === undefined) return null;
  return new Date(Date.UTC(2000 + parseInt(m[3], 10), month, parseInt(m[1], 10), 8, 0, 0));
}

interface Parsed {
  expiry: string;
  expiryDate: Date;
  strike: number;
  type: "C" | "P";
}

function parseInstrument(name: string): Parsed | null {
  // BTC-26APR26-78000-C
  const parts = name.split("-");
  if (parts.length !== 4) return null;
  const [currency, expiryStr, strikeStr, typeStr] = parts;
  if (currency !== "BTC") return null;
  const strike = parseInt(strikeStr, 10);
  if (isNaN(strike) || strike <= 0) return null;
  if (typeStr !== "C" && typeStr !== "P") return null;
  const expiryDate = parseExpiryDate(expiryStr);
  if (!expiryDate) return null;
  return { expiry: expiryStr, expiryDate, strike, type: typeStr };
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

// ── Public API ────────────────────────────────────────────────────

export async function computeOptionsZones(
  currentBtcPrice: number,
): Promise<OptionsZones> {
  // 1. Fetch all BTC options
  const url = `${DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Deribit API ${res.status}`);

  const json = await res.json() as { result?: DeribitSummary[] };
  const all  = json.result ?? [];

  const nowMs       = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 2. Parse + filter: only options expiring within 7 days with non-zero OI
  const parsed: (Parsed & { open_interest: number })[] = [];
  for (const item of all) {
    if (item.open_interest <= 0) continue;
    const p = parseInstrument(item.instrument_name);
    if (!p) continue;
    const msToExpiry = p.expiryDate.getTime() - nowMs;
    if (msToExpiry <= 0 || msToExpiry > sevenDaysMs) continue;
    parsed.push({ ...p, open_interest: item.open_interest });
  }

  if (parsed.length === 0) throw new Error("No near-term Deribit BTC options found");

  // 3. Group by expiry, rank by total OI, take top 3
  const byExpiry = new Map<string, { totalOI: number; items: typeof parsed }>();
  for (const item of parsed) {
    const e = byExpiry.get(item.expiry) ?? { totalOI: 0, items: [] };
    e.totalOI += item.open_interest;
    e.items.push(item);
    byExpiry.set(item.expiry, e);
  }

  const topExpiries = [...byExpiry.entries()]
    .sort((a, b) => b[1].totalOI - a[1].totalOI)
    .slice(0, 3);

  const expiriesUsed = topExpiries.map(([label]) => label);

  // 4. Aggregate call/put OI by strike across top 3 expiries
  const strikes = new Map<number, { callOI: number; putOI: number }>();
  for (const [, { items }] of topExpiries) {
    for (const item of items) {
      const entry = strikes.get(item.strike) ?? { callOI: 0, putOI: 0 };
      if (item.type === "C") entry.callOI += item.open_interest;
      else                   entry.putOI  += item.open_interest;
      strikes.set(item.strike, entry);
    }
  }

  // 5. Bull zone: highest put OI strike BELOW current price
  let bullStrike: number | null = null;
  let bullOI = 0;
  for (const [strike, { putOI }] of strikes) {
    if (strike < currentBtcPrice && putOI > bullOI) {
      bullOI     = putOI;
      bullStrike = strike;
    }
  }

  // 6. Bear zone: highest call OI strike ABOVE current price
  let bearStrike: number | null = null;
  let bearOI = 0;
  for (const [strike, { callOI }] of strikes) {
    if (strike > currentBtcPrice && callOI > bearOI) {
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
    // Exit bull when price leaves the bull zone from above — trades only near the zone
    bullExitAbove: bullStrike !== null ? bullStrike + ZONE_HALF_WIDTH : null,
    bullOI:        bullOI > 0 ? bullOI : null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - ZONE_HALF_WIDTH : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + ZONE_HALF_WIDTH : null,
    // Exit bear when price leaves the bear zone from below — trades only near the zone
    bearExitBelow: bearStrike !== null ? bearStrike - ZONE_HALF_WIDTH : null,
    bearOI:        bearOI > 0 ? bearOI : null,

    maxPain,
    expiriesUsed,
    btcPrice:   currentBtcPrice,
    computedAt: new Date().toISOString(),
  };
}
