/**
 * Deribit-based liquidation zone suggester.
 *
 * Logic:
 *   1. Fetch all active BTC options from Deribit (free public API).
 *   2. Parse expiry from instrument name (e.g. "BTC-26APR26-78000-C").
 *   3. Find the nearest expiry with total OI ≥ MIN_OI_THRESHOLD; if thin,
 *      fall back to the next liquid one (still within 7 days).
 *   4. Aggregate call OI and put OI by strike for that single expiry.
 *   5. Bull zone  → dominant PUT  strike below price (highest put OI)
 *   6. Bear zone  → dominant CALL strike above price (highest call OI)
 *   7. Gap check  → bearStrike - bullStrike must be ≥ MIN_STRIKE_GAP ($2,500)
 *   8. Exit levels → Max Pain (price gravitates there by expiry; used as
 *      deactivation level for new trades, not individual trade exits)
 */

const DERIBIT_API       = "https://www.deribit.com/api/v2/public";
const ZONE_HALF_WIDTH   = 300;   // ± $300 → each zone is $600 wide total
const MIN_OI_THRESHOLD  = 300;   // minimum BTC contracts to consider an expiry liquid
const MIN_STRIKE_GAP    = 2500;  // bearStrike - bullStrike must be ≥ $2,500

export interface OptionsZones {
  bullStrike:    number | null;
  bullZoneLow:   number | null;  // bullStrike - ZONE_HALF_WIDTH
  bullZoneHigh:  number | null;  // bullStrike + ZONE_HALF_WIDTH
  bullExitAbove: number | null;  // maxPain — keep trading until natural target

  bearStrike:    number | null;
  bearZoneLow:   number | null;  // bearStrike - ZONE_HALF_WIDTH
  bearZoneHigh:  number | null;  // bearStrike + ZONE_HALF_WIDTH
  bearExitBelow: number | null;  // maxPain

  maxPain:          number | null;
  expiryUsed:       string | null;   // e.g. "29APR26"
  expiryOI:         number | null;   // total OI of the chosen expiry
  bullOI:           number | null;   // put OI at bull strike
  bearOI:           number | null;   // call OI at bear strike
  insufficientGap:  boolean;         // true if gap < MIN_STRIKE_GAP
  btcPrice:         number;
  computedAt:       string;
}

// ── Deribit API ───────────────────────────────────────────────────

interface DeribitSummary {
  instrument_name: string;
  open_interest:   number; // BTC contracts
}

// ── Helpers ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Parse "26APR26" → UTC Date at 08:00 (Deribit expiry time). */
function parseExpiryDate(s: string): Date | null {
  const m = s.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2]];
  if (month === undefined) return null;
  return new Date(Date.UTC(2000 + parseInt(m[3], 10), month, parseInt(m[1], 10), 8, 0, 0));
}

interface Parsed {
  expiry:     string;
  expiryDate: Date;
  strike:     number;
  type:       "C" | "P";
  oi:         number;
}

function parseInstrument(name: string, oi: number): Parsed | null {
  const parts = name.split("-");
  if (parts.length !== 4 || parts[0] !== "BTC") return null;
  const strike = parseInt(parts[2], 10);
  if (isNaN(strike) || strike <= 0) return null;
  if (parts[3] !== "C" && parts[3] !== "P") return null;
  const expiryDate = parseExpiryDate(parts[1]);
  if (!expiryDate) return null;
  return { expiry: parts[1], expiryDate, strike, type: parts[3] as "C" | "P", oi };
}

function computeMaxPain(
  strikes: Map<number, { callOI: number; putOI: number }>,
): number | null {
  const list = [...strikes.keys()].sort((a, b) => a - b);
  if (!list.length) return null;
  let best = list[0]; let minPayout = Infinity;
  for (const s of list) {
    let p = 0;
    for (const [k, { callOI, putOI }] of strikes) {
      if (s > k) p += (s - k) * callOI;
      if (s < k) p += (k - s) * putOI;
    }
    if (p < minPayout) { minPayout = p; best = s; }
  }
  return best;
}

// ── Public API ────────────────────────────────────────────────────

export async function computeOptionsZones(
  currentBtcPrice: number,
): Promise<OptionsZones> {
  const empty = (reason?: string): OptionsZones => ({
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null,
    maxPain: null, expiryUsed: null, expiryOI: null,
    bullOI: null, bearOI: null,
    insufficientGap: false,
    btcPrice: currentBtcPrice, computedAt: new Date().toISOString(),
  });

  // 1. Fetch
  const res  = await fetch(
    `${DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Deribit API ${res.status}`);
  const json = await res.json() as { result?: DeribitSummary[] };

  const nowMs       = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 2. Parse all near-term options
  const allParsed: Parsed[] = [];
  for (const item of json.result ?? []) {
    if (item.open_interest <= 0) continue;
    const p = parseInstrument(item.instrument_name, item.open_interest);
    if (!p) continue;
    const ms = p.expiryDate.getTime() - nowMs;
    if (ms <= 0 || ms > sevenDaysMs) continue;
    allParsed.push(p);
  }
  if (!allParsed.length) return empty();

  // 3. Group by expiry, sort by date (nearest first), pick first with OI ≥ threshold
  const byExpiry = new Map<string, { expiryDate: Date; totalOI: number; items: Parsed[] }>();
  for (const p of allParsed) {
    const e = byExpiry.get(p.expiry) ?? { expiryDate: p.expiryDate, totalOI: 0, items: [] };
    e.totalOI += p.oi;
    e.items.push(p);
    byExpiry.set(p.expiry, e);
  }

  const sorted = [...byExpiry.entries()].sort(
    (a, b) => a[1].expiryDate.getTime() - b[1].expiryDate.getTime(),
  );

  const chosen = sorted.find(([, v]) => v.totalOI >= MIN_OI_THRESHOLD);
  if (!chosen) return empty();

  const [expiryUsed, { totalOI: expiryOI, items }] = chosen;

  // 4. Aggregate call/put OI by strike
  const strikes = new Map<number, { callOI: number; putOI: number }>();
  for (const p of items) {
    const entry = strikes.get(p.strike) ?? { callOI: 0, putOI: 0 };
    if (p.type === "C") entry.callOI += p.oi;
    else                entry.putOI  += p.oi;
    strikes.set(p.strike, entry);
  }

  // 5. Bull zone: highest put OI BELOW current price
  let bullStrike: number | null = null; let bullOI = 0;
  for (const [strike, { putOI }] of strikes) {
    if (strike < currentBtcPrice && putOI > bullOI) { bullOI = putOI; bullStrike = strike; }
  }

  // 6. Bear zone: highest call OI ABOVE current price
  let bearStrike: number | null = null; let bearOI = 0;
  for (const [strike, { callOI }] of strikes) {
    if (strike > currentBtcPrice && callOI > bearOI) { bearOI = callOI; bearStrike = strike; }
  }

  // 7. Max Pain
  const maxPain = computeMaxPain(strikes);

  // 8. Gap check
  const gap = (bullStrike !== null && bearStrike !== null)
    ? bearStrike - bullStrike : 0;
  const insufficientGap = gap < MIN_STRIKE_GAP;

  return {
    bullStrike,
    bullZoneLow:   bullStrike !== null ? bullStrike - ZONE_HALF_WIDTH : null,
    bullZoneHigh:  bullStrike !== null ? bullStrike + ZONE_HALF_WIDTH : null,
    // Exit bull the moment price leaves the zone upward — strict zone only
    bullExitAbove: bullStrike !== null ? bullStrike + ZONE_HALF_WIDTH : null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - ZONE_HALF_WIDTH : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + ZONE_HALF_WIDTH : null,
    // Exit bear the moment price leaves the zone downward — strict zone only
    bearExitBelow: bearStrike !== null ? bearStrike - ZONE_HALF_WIDTH : null,

    maxPain,
    expiryUsed,
    expiryOI,
    bullOI:  bullOI  > 0 ? bullOI  : null,
    bearOI:  bearOI  > 0 ? bearOI  : null,
    insufficientGap,
    btcPrice:   currentBtcPrice,
    computedAt: new Date().toISOString(),
  };
}
