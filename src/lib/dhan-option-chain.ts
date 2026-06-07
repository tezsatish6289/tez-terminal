/**
 * Dhan option chain + expiry list for NSE equity underlyings (F&O stocks).
 * Used for on-demand stock zone levels — same licensed feed as intraday candles.
 */

import "server-only";
import { ensureValidToken } from "@/lib/dhan-token";
import { resolveDhanEquitySecurityId } from "@/lib/dhan-candles";
import type { EquityStrikeData } from "@/lib/equity-options-zones";

const DHAN_BASE_URL = "https://api.dhan.co/v2";
const DHAN_TIMEOUT_MS = 15_000;
/** Dhan docs: one option-chain request per 3 seconds (global for this worker). */
const MIN_GAP_MS = 3_100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastOptionChainCallAt = 0;

async function throttleOptionChain(): Promise<void> {
  const now = Date.now();
  const wait = lastOptionChainCallAt + MIN_GAP_MS - now;
  if (wait > 0) await sleep(wait);
  lastOptionChainCallAt = Date.now();
}

interface DhanOcLeg {
  oi?: number;
  implied_volatility?: number;
}

interface DhanOcStrike {
  ce?: DhanOcLeg;
  pe?: DhanOcLeg;
}

interface DhanOptionChainResponse {
  data?: {
    last_price?: number;
    oc?: Record<string, DhanOcStrike>;
  };
  status?: string;
}

interface DhanExpiryListResponse {
  data?: string[];
  status?: string;
}

async function dhanOptionChainPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const creds = await ensureValidToken();
  if (!creds) throw new Error("market_data_unavailable");

  await throttleOptionChain();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DHAN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${DHAN_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "access-token": creds.apiKey,
        "client-id": creds.apiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`dhan_option_chain_${res.status}:${text.slice(0, 120)}`);
  }

  return (await res.json()) as T;
}

export async function fetchDhanEquityExpiries(securityId: number): Promise<string[]> {
  const json = await dhanOptionChainPost<DhanExpiryListResponse>("/optionchain/expirylist", {
    UnderlyingScrip: securityId,
    UnderlyingSeg: "NSE_EQ",
  });
  const list = json.data ?? [];
  if (!list.length) throw new Error("no_expiries");
  return list;
}

export interface DhanEquityChainSnapshot {
  spot: number;
  expiry: string;
  strikes: Map<number, EquityStrikeData>;
}

export async function fetchDhanEquityOptionChain(
  symbol: string,
  expiry: string,
  securityId: number,
): Promise<DhanEquityChainSnapshot> {
  const json = await dhanOptionChainPost<DhanOptionChainResponse>("/optionchain", {
    UnderlyingScrip: securityId,
    UnderlyingSeg: "NSE_EQ",
    Expiry: expiry,
  });

  const spot = Number(json.data?.last_price ?? 0);
  const oc = json.data?.oc ?? {};
  const strikes = new Map<number, EquityStrikeData>();

  for (const [strikeKey, row] of Object.entries(oc)) {
    const strike = Number(strikeKey);
    if (!Number.isFinite(strike)) continue;
    const callOI = Number(row.ce?.oi ?? 0);
    const putOI = Number(row.pe?.oi ?? 0);
    if (callOI === 0 && putOI === 0) continue;
    const s = strikes.get(strike) ?? { callOI: 0, putOI: 0 };
    s.callOI += callOI;
    s.putOI += putOI;
    if (typeof row.ce?.implied_volatility === "number") s.callIV = row.ce.implied_volatility;
    if (typeof row.pe?.implied_volatility === "number") s.putIV = row.pe.implied_volatility;
    strikes.set(strike, s);
  }

  return { spot, expiry, strikes };
}

/** Resolve symbol → security id, nearest expiry, and full OI map. */
export async function loadDhanEquityOptionChain(symbol: string): Promise<DhanEquityChainSnapshot> {
  const { snapshot } = await loadDhanEquityOptionChainWithExpiries(symbol);
  return snapshot;
}

/**
 * Like {@link loadDhanEquityOptionChain} but also returns the security id + full
 * expiry list, so callers can fetch a 2nd expiry for term-structure parity with
 * the NSE path. (Each extra option-chain call still pays Dhan's ~3.1s throttle.)
 */
export async function loadDhanEquityOptionChainWithExpiries(symbol: string): Promise<{
  snapshot: DhanEquityChainSnapshot;
  securityId: number;
  expiries: string[];
}> {
  const securityId = await resolveDhanEquitySecurityId(symbol);
  if (securityId == null) throw new Error("unknown_symbol");

  const expiries = await fetchDhanEquityExpiries(securityId);
  const snapshot = await fetchDhanEquityOptionChain(symbol, expiries[0], securityId);
  return { snapshot, securityId, expiries };
}
