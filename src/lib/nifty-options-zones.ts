import { nseFetch } from "@/lib/nse-fetch";

/**
 * NSE option chain based zone suggester for NIFTY.
 *
 * Mirrors options-zones.ts (Deribit/BTC) but uses NSE India's public
 * option chain endpoint for NIFTY.
 *
 * Logic:
 *   1. Fetch NSE option chain (requires a session cookie from the NSE homepage).
 *   2. Use embedded underlyingValue as spot price (no external price dependency).
 *   3. Filter to options expiring within 14 days.
 *   4. Find the nearest weekly expiry with total OI ≥ MIN_OI_THRESHOLD.
 *   5. Aggregate call OI and put OI by strike for that expiry.
 *   6. Bull zone → dominant PUT  strike below spot (highest put OI).
 *   7. Bear zone → dominant CALL strike above spot (highest call OI).
 *   8. Gap check → bearStrike - bullStrike must be ≥ MIN_STRIKE_GAP.
 *   9. Zone bands → ±ZONE_HALF_WIDTH points around each dominant strike.
 *  10. Max Pain  → minimises total payout across all strikes (directional
 *      target for the UI; not used as hard exit).
 */

const NSE_HOME = "https://www.nseindia.com";
/** NSE site uses v3 in-browser; older `option-chain-indices` often returns `{}` for automated clients. */
const NSE_OC   = "https://www.nseindia.com/api/option-chain-v3?symbol=NIFTY";
/** Lightweight JSON endpoints used by scrapers to finalize nsit / nseappid session cookies. */
const NSE_MARKET_STATUS = "https://www.nseindia.com/api/marketStatus";
const NSE_ALL_INDICES  = "https://www.nseindia.com/api/allIndices";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ±Nifty points around each dominant strike; full band = 2×. */
export const DEFAULT_ZONE_HALF_WIDTH_PTS = 150;
const MIN_ZONE_HALF_WIDTH_PTS = 25;
const MAX_ZONE_HALF_WIDTH_PTS = 1000;

/** Minimum total OI (contracts) for an expiry to be considered liquid. */
const MIN_OI_THRESHOLD = 50_000;

/** bearStrike − bullStrike must be at least this many Nifty points. */
const MIN_STRIKE_GAP = 600;

/** Only consider expiries within this many days from today. */
const MAX_EXPIRY_DAYS = 14;

/** Empty shape when NSE fetch fails before route-layer merge with Firestore. */
export function createEmptyNiftyZonesResult(niftyPrice: number): NiftyOptionsZones {
  return {
    bullStrike: null,
    bullZoneLow: null,
    bullZoneHigh: null,
    bullExitAbove: null,
    bearStrike: null,
    bearZoneLow: null,
    bearZoneHigh: null,
    bearExitBelow: null,
    maxPain: null,
    expiryUsed: null,
    expiryOI: null,
    bullOI: null,
    bearOI: null,
    insufficientGap: false,
    niftyPrice: niftyPrice > 0 ? niftyPrice : 0,
    computedAt: new Date().toISOString(),
  };
}

export interface NiftyOptionsZones {
  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;

  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null;

  maxPain:         number | null;
  expiryUsed:      string | null;
  expiryOI:        number | null;
  bullOI:          number | null;
  bearOI:          number | null;
  insufficientGap: boolean;
  niftyPrice:      number;
  computedAt:      string;
}

// ── NSE fetch with cookie ─────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-IN,en;q=0.9",
  /** gzip/deflate only — rare broken br decode on serverless breaks JSON parsing. */
  "Accept-Encoding": "gzip, deflate",
  Referer: "https://www.nseindia.com/option-chain",
  "X-Requested-With": "XMLHttpRequest",
  Connection: "keep-alive",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

/**
 * Extract Set-Cookie fragments. IMPORTANT: one comma-separated "set-cookie" header is unsafe
 * (Expires=Wed, 21 May 2025 contains commas). Prefer Headers#getSetCookie when available (Node/undici).
 */
function cookiesFromResponse(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    try {
      return h
        .getSetCookie()
        .map((line) => line.split(";")[0]?.trim())
        .filter(Boolean) as string[];
    } catch {
      /* fall through */
    }
  }
  const raw = res.headers.get("set-cookie") ?? "";
  if (!raw) return [];
  return raw.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
}

/** Merge cookie fragments from multiple responses (latest wins per cookie name). */
function mergeCookieJar(fragments: string[][]): string {
  const map = new Map<string, string>();
  for (const group of fragments) {
    for (const c of group) {
      const name = c.split("=")[0]?.trim();
      if (name) map.set(name, c);
    }
  }
  return [...map.values()].join("; ");
}

async function getNseCookies(): Promise<string> {
  const batches: string[][] = [];

  const pushCookies = (res: Response) => {
    batches.push(cookiesFromResponse(res));
  };

  // 1) Homepage — initial nsit / bm_sv / etc.
  pushCookies(
    await nseFetch(NSE_HOME, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    }),
  );

  await sleep(250);

  let jar = mergeCookieJar(batches);

  // 2) Session JSON — establishes tokens many scrapers rely on before option-chain API
  try {
    pushCookies(
      await nseFetch(NSE_MARKET_STATUS, {
        headers: { ...API_HEADERS, Cookie: jar, Referer: `${NSE_HOME}/` },
        signal: AbortSignal.timeout(12_000),
      }),
    );
  } catch {
    /* non-fatal */
  }

  await sleep(250);
  jar = mergeCookieJar(batches);

  // 3) Option-chain HTML page (same tab flow as a real user)
  pushCookies(
    await nseFetch("https://www.nseindia.com/option-chain", {
      headers: { ...BROWSER_HEADERS, Cookie: jar, Referer: NSE_HOME },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    }),
  );

  await sleep(250);
  jar = mergeCookieJar(batches);

  // 4) Another JSON hop — keeps cookie jar warm for same-origin XHR-style calls
  try {
    pushCookies(
      await nseFetch(NSE_ALL_INDICES, {
        headers: { ...API_HEADERS, Cookie: jar, Referer: "https://www.nseindia.com/option-chain" },
        signal: AbortSignal.timeout(12_000),
      }),
    );
  } catch {
    /* non-fatal */
  }

  return mergeCookieJar(batches);
}

interface NseOptionEntry {
  strikePrice: number;
  /** v3: row-level label e.g. "05-May-2026" */
  expiryDates?: string;
  /** Legacy indices API row field */
  expiryDate?: string;
  CE?: { openInterest: number; expiryDate?: string };
  PE?: { openInterest: number; expiryDate?: string };
}

/** v3 uses `expiryDates`; legacy used `expiryDate`; CE/PE may carry DD-MM-YYYY. */
function rowExpiryLabel(row: NseOptionEntry): string | null {
  const top = row.expiryDates?.trim() || row.expiryDate?.trim();
  if (top) return top;
  const ce = row.CE?.expiryDate?.trim();
  const pe = row.PE?.expiryDate?.trim();
  if (ce && pe && ce === pe) return ce;
  return ce ?? pe ?? null;
}

interface NseOcResponse {
  records?: {
    data?:            NseOptionEntry[];
    expiryDates?:     string[];
    underlyingValue?: number; // current Nifty spot price embedded in response
  };
}

async function fetchNseOptionChain(cookies: string): Promise<NseOcResponse> {
  if (!cookies.trim()) {
    throw new Error(
      "NSE session has no cookies after bootstrap — cannot load option chain (check network / TLS).",
    );
  }

  const res = await nseFetch(NSE_OC, {
    headers: { ...API_HEADERS, Cookie: cookies },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`NSE option chain HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  const trimmed = text.trim();
  // Unauthenticated browser-tab requests also get "{}". JSON.parse succeeds but there is no chain.
  if (trimmed === "{}" || trimmed === "") {
    throw new Error(
      "NSE returned an empty JSON body (often {}). Session cookies were rejected or expired. " +
        "If this persists from your server region, NSE may be blocking cloud/datacenter IPs — use an Indian egress proxy or run this job from a residential/VPN endpoint in India.",
    );
  }
  try {
    return JSON.parse(text) as NseOcResponse;
  } catch {
    // Likely got an HTML error page instead of JSON — NSE blocked the request
    throw new Error(`NSE returned non-JSON (likely bot-blocked). Status: ${res.status}`);
  }
}

/** Multiple full bootstrap + chain fetches — NSE often returns {} until cookies stabilize. */
async function fetchNseOptionChainWithRetries(maxAttempts = 3): Promise<NseOcResponse> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) await sleep(500 * attempt);
      const cookies = await getNseCookies();
      return await fetchNseOptionChain(cookies);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === maxAttempts) throw lastErr;
    }
  }
  throw lastErr ?? new Error("NSE option chain fetch failed");
}

// ── Helpers ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,  Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse NSE expiry strings → Date at 15:30 IST (NSE expiry time).
 * Supports "08-May-2025" / "05-May-2026" (DD-MMM-YYYY) and v3 CE/PE "05-05-2026" (DD-MM-YYYY).
 */
function parseNseExpiry(s: string): Date | null {
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const monthName = MONTH_MAP[parts[1]];
  if (monthName !== undefined) {
    const day = parseInt(parts[0], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(year)) return null;
    return new Date(Date.UTC(year, monthName, day, 10, 0, 0));
  }
  const dayNum = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(dayNum) || isNaN(monthNum) || isNaN(year)) return null;
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return new Date(Date.UTC(year, monthNum - 1, dayNum, 10, 0, 0));
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

function clampZoneHalfWidth(raw: number | null | undefined): number {
  const v = raw ?? DEFAULT_ZONE_HALF_WIDTH_PTS;
  return Math.min(MAX_ZONE_HALF_WIDTH_PTS, Math.max(MIN_ZONE_HALF_WIDTH_PTS, v));
}

const STRIKE_STEP = 50;

/**
 * When NSE returns `{}` from a foreign/cloud IP but we still know spot (e.g. DHAN `NIFTY50` in
 * `exchange_prices`), build bull/bear strikes symmetrically around spot so AUTO-switch has usable bands.
 * This is not OI-based; add `NSE_HTTPS_PROXY` (Indian egress) to get real NSE option chain data.
 */
export function buildSyntheticZonesFromSpot(
  spot: number,
  opts?: { zoneHalfWidthPts?: number | null },
): NiftyOptionsZones {
  if (!Number.isFinite(spot) || spot <= 0) {
    return createEmptyNiftyZonesResult(0);
  }
  const halfWidth = clampZoneHalfWidth(opts?.zoneHalfWidthPts ?? null);
  const anchor = Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
  let bullStrike = anchor - 400;
  let bearStrike = anchor + 400;
  if (bearStrike - bullStrike < MIN_STRIKE_GAP) {
    bearStrike = bullStrike + MIN_STRIKE_GAP + STRIKE_STEP;
  }

  return {
    bullStrike,
    bearStrike,
    bullZoneLow: bullStrike - halfWidth,
    bullZoneHigh: bullStrike + halfWidth,
    bullExitAbove: bullStrike + halfWidth,
    bearZoneLow: bearStrike - halfWidth,
    bearZoneHigh: bearStrike + halfWidth,
    bearExitBelow: bearStrike - halfWidth,
    maxPain: anchor,
    expiryUsed: "synthetic (spot-only)",
    expiryOI: null,
    bullOI: null,
    bearOI: null,
    insufficientGap: false,
    niftyPrice: spot,
    computedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────

export async function computeNiftyOptionsZones(
  currentNiftyPrice: number,
  opts?: { zoneHalfWidthPts?: number | null },
): Promise<NiftyOptionsZones> {
  const halfWidth = clampZoneHalfWidth(opts?.zoneHalfWidthPts ?? null);

  // 1. Fetch NSE option chain (retries help cold sessions and flaky {} responses)
  let ocData: NseOcResponse;
  try {
    ocData = await fetchNseOptionChainWithRetries(3);
  } catch (err) {
    throw new Error(`NSE fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Use embedded spot price from NSE response if caller didn't provide one
  const spotPrice =
    (currentNiftyPrice > 0 ? currentNiftyPrice : null) ??
    (ocData.records?.underlyingValue ?? 0);

  const empty = (): NiftyOptionsZones => ({
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null,
    maxPain: null, expiryUsed: null, expiryOI: null,
    bullOI: null, bearOI: null, insufficientGap: false,
    niftyPrice: spotPrice || currentNiftyPrice, computedAt: new Date().toISOString(),
  });

  if (spotPrice <= 0) return empty();

  const rows = ocData.records?.data ?? [];
  if (!rows.length) return empty();

  const nowMs       = Date.now();
  const maxExpiryMs = MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  // 2. Group by expiry — filter to near-term only
  const byExpiry = new Map<string, {
    expiryDate: Date;
    totalOI:    number;
    strikes:    Map<number, { callOI: number; putOI: number }>;
  }>();

  for (const row of rows) {
    const expiryLabel = rowExpiryLabel(row);
    if (!expiryLabel || row.strikePrice == null) continue;
    const expDate = parseNseExpiry(expiryLabel);
    if (!expDate) continue;
    const ms = expDate.getTime() - nowMs;
    if (ms <= 0 || ms > maxExpiryMs) continue;

    const callOI = row.CE?.openInterest ?? 0;
    const putOI  = row.PE?.openInterest ?? 0;
    if (callOI === 0 && putOI === 0) continue;

    const existing = byExpiry.get(expiryLabel) ?? {
      expiryDate: expDate, totalOI: 0,
      strikes: new Map<number, { callOI: number; putOI: number }>(),
    };
    existing.totalOI += callOI + putOI;
    const s = existing.strikes.get(row.strikePrice) ?? { callOI: 0, putOI: 0 };
    s.callOI += callOI;
    s.putOI  += putOI;
    existing.strikes.set(row.strikePrice, s);
    byExpiry.set(expiryLabel, existing);
  }

  if (!byExpiry.size) return empty();

  // 3. Sort expiries by date, pick nearest with OI ≥ threshold
  const sorted = [...byExpiry.entries()].sort(
    (a, b) => a[1].expiryDate.getTime() - b[1].expiryDate.getTime(),
  );

  // Prefer liquid expiry (OI ≥ threshold). If none qualify (early session, holiday week),
  // still use the nearest expiry — otherwise refresh wipes the UI with empty bands.
  const chosen =
    sorted.find(([, v]) => v.totalOI >= MIN_OI_THRESHOLD) ?? sorted[0];

  const [expiryUsed, { totalOI: expiryOI, strikes: primaryStrikes }] = chosen;

  // 4. Merged strike map (can accumulate fallbacks if needed)
  const strikes = new Map<number, { callOI: number; putOI: number }>(primaryStrikes);

  const findStrikes = () => {
    let bullStrike: number | null = null; let bullOI = 0;
    let bearStrike: number | null = null; let bearOI = 0;
    for (const [strike, { putOI, callOI }] of strikes) {
      if (strike < spotPrice && putOI > bullOI) { bullOI = putOI; bullStrike = strike; }
      if (strike > spotPrice && callOI > bearOI) { bearOI = callOI; bearStrike = strike; }
    }
    return { bullStrike, bullOI, bearStrike, bearOI };
  };

  let { bullStrike, bullOI, bearStrike, bearOI } = findStrikes();

  // Fallback: if one side is missing, include next 2 expiries
  if (bullStrike === null || bearStrike === null) {
    const fallbacks = sorted.filter(([label]) => label !== expiryUsed).slice(0, 2);
    for (const [, { strikes: fbStrikes }] of fallbacks) {
      for (const [sk, { callOI, putOI }] of fbStrikes) {
        const entry = strikes.get(sk) ?? { callOI: 0, putOI: 0 };
        entry.callOI += callOI;
        entry.putOI  += putOI;
        strikes.set(sk, entry);
      }
    }
    ({ bullStrike, bullOI, bearStrike, bearOI } = findStrikes());
  }

  // 5. Max Pain
  const maxPain = computeMaxPain(strikes);

  // 6. Gap check
  const gap = (bullStrike !== null && bearStrike !== null)
    ? bearStrike - bullStrike : 0;
  const insufficientGap = gap < MIN_STRIKE_GAP;

  return {
    bullStrike,
    bullZoneLow:   bullStrike !== null ? bullStrike - halfWidth : null,
    bullZoneHigh:  bullStrike !== null ? bullStrike + halfWidth : null,
    bullExitAbove: bullStrike !== null ? bullStrike + halfWidth : null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - halfWidth : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + halfWidth : null,
    bearExitBelow: bearStrike !== null ? bearStrike - halfWidth : null,

    maxPain,
    expiryUsed,
    expiryOI,
    bullOI: bullOI > 0 ? bullOI : null,
    bearOI: bearOI > 0 ? bearOI : null,
    insufficientGap,
    niftyPrice: spotPrice,
    computedAt: new Date().toISOString(),
  };
}
