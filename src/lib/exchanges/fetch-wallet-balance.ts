/**
 * Single source of truth for reading a user's futures / unified wallet from
 * an exchange.
 *
 * Semantics (consistent across venues):
 *   total        — free USDT/USDC + margin locked in open trades/orders
 *   available    — free margin to open new positions
 *   lockedInUse  — total − available (margin currently in use)
 *
 * All display, persistence, ledger snapshots, and validation flows should
 * call `fetchExchangeWalletBalance`. Live trade sizing in trade-engine keeps
 * its own path but uses the same connector `getUsdtBalance` underneath.
 */

import { getConnector } from "./registry";
import type { ExchangeCredentials, ExchangeName } from "./types";

export interface ExchangeWalletBalance {
  exchange: string;
  currency: string;
  total: number;
  available: number;
  lockedInUse: number;
}

export function walletCurrencyFor(exchange: string): string {
  const up = String(exchange ?? "").toUpperCase();
  if (up === "HYPERLIQUID") return "USDC";
  if (up === "DHAN") return "INR";
  return "USDT";
}

export function walletLockedInUse(total: number, available: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(available)) return 0;
  return Math.max(0, Math.round((total - available) * 100) / 100);
}

export function normalizeWalletBalance(
  exchange: string,
  raw: { total: number; available: number },
): ExchangeWalletBalance {
  const total = Number.isFinite(raw.total) ? raw.total : 0;
  const available = Number.isFinite(raw.available) ? raw.available : 0;
  return {
    exchange: String(exchange).toUpperCase(),
    currency: walletCurrencyFor(exchange),
    total,
    available,
    lockedInUse: walletLockedInUse(total, available),
  };
}

/** Fetch + normalize wallet balance for one exchange account. */
export async function fetchExchangeWalletBalance(
  exchange: ExchangeName,
  creds: ExchangeCredentials,
): Promise<ExchangeWalletBalance> {
  const connector = getConnector(exchange);
  const raw = await connector.getUsdtBalance(creds);
  return normalizeWalletBalance(exchange, raw);
}
