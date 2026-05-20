/**
 * Normalize admin headline amounts to USDT-equivalent.
 *
 * Rates:
 *   - USDT / USD / USDC → 1:1 (USDC folded into USDT per product spec)
 *   - INR → live USD/INR from Frankfurter (free, no API key), with optional
 *     env override `INR_PER_USDT` for ops-controlled fallback
 *
 * Rates are cached in-process for 1 hour to avoid hammering the FX API on
 * every admin page refresh.
 */

export type SupportedQuoteCurrency = "USDT" | "USDC" | "USD" | "INR";

export interface UsdtRatesSnapshot {
  /** Multiply native amount by this to get USDT (e.g. INR × inrPerUsdt). */
  inrPerUsdt: number;
  usdcPerUsdt: number;
  usdtPerUsdt: number;
  fetchedAt: string;
  source: "env" | "frankfurter" | "fallback";
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { at: number; rates: UsdtRatesSnapshot } | null = null;

const DEFAULT_INR_PER_USDT = 1 / 83; // ~₹83 per $1 if FX fetch fails

function parseEnvInrPerUsdt(): number | null {
  const raw = process.env.INR_PER_USDT?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function fetchInrPerUsdtFromFrankfurter(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { INR?: number } };
    const inrPerUsd = data.rates?.INR;
    if (typeof inrPerUsd !== "number" || inrPerUsd <= 0) return null;
    return 1 / inrPerUsd;
  } catch {
    return null;
  }
}

export async function getUsdtRates(): Promise<UsdtRatesSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.rates;
  }

  const envRate = parseEnvInrPerUsdt();
  if (envRate != null) {
    const rates: UsdtRatesSnapshot = {
      inrPerUsdt: envRate,
      usdcPerUsdt: 1,
      usdtPerUsdt: 1,
      fetchedAt: new Date().toISOString(),
      source: "env",
    };
    cached = { at: now, rates };
    return rates;
  }

  const fx = await fetchInrPerUsdtFromFrankfurter();
  const rates: UsdtRatesSnapshot = {
    inrPerUsdt: fx ?? DEFAULT_INR_PER_USDT,
    usdcPerUsdt: 1,
    usdtPerUsdt: 1,
    fetchedAt: new Date().toISOString(),
    source: fx != null ? "frankfurter" : "fallback",
  };
  cached = { at: now, rates };
  return rates;
}

export function convertToUsdt(
  amount: number,
  currency: string | null | undefined,
  rates: UsdtRatesSnapshot,
): number {
  if (!Number.isFinite(amount)) return 0;
  const c = String(currency ?? "USDT").toUpperCase();
  if (c === "INR") return amount * rates.inrPerUsdt;
  if (c === "USDC") return amount * rates.usdcPerUsdt;
  return amount * rates.usdtPerUsdt;
}
