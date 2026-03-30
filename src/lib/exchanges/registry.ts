/**
 * Exchange connector registry.
 *
 * Provides a factory to get the right connector for any supported exchange.
 * Connectors are singletons — stateless, credentials passed per-call.
 */
import { type ExchangeName, type ExchangeConnector } from "./types";
import { BybitConnector } from "./bybit";
import { BinanceConnector } from "./binance";
import { MexcConnector } from "./mexc";
import { DhanConnector } from "./dhan";

const connectors: Record<ExchangeName, ExchangeConnector> = {
  BYBIT: new BybitConnector(),
  BINANCE: new BinanceConnector(),
  MEXC: new MexcConnector(),
  DHAN: new DhanConnector(),
};

/**
 * Get the exchange connector for a given exchange name.
 * The exchange field from signals is passed directly here.
 */
export function getConnector(exchange: string): ExchangeConnector {
  const name = exchange.toUpperCase() as ExchangeName;
  const connector = connectors[name];
  if (!connector) {
    throw new Error(`Unsupported exchange: ${exchange}. Supported: ${Object.keys(connectors).join(", ")}`);
  }
  return connector;
}

/**
 * Check if an exchange is supported for live trading.
 */
export function isExchangeSupported(exchange: string): boolean {
  return exchange.toUpperCase() in connectors;
}

/**
 * Get all registered connector instances.
 */
export function getAllConnectors(): ExchangeConnector[] {
  return Object.values(connectors);
}

// ── Firestore secret doc helpers ─────────────────────────────

/**
 * Primary Firestore doc ID for an exchange's credentials.
 *
 * CRITICAL: "binance_futures" is used for Binance to avoid collision
 * with the legacy "binance" doc which actually holds Bybit credentials
 * from before the multi-exchange migration.
 */
const SECRET_DOC_IDS: Record<ExchangeName, string> = {
  BYBIT: "bybit",
  BINANCE: "binance_futures",
  MEXC: "mexc",
  DHAN: "dhan",
};

export function getSecretDocId(exchange: ExchangeName): string {
  return SECRET_DOC_IDS[exchange];
}

/**
 * All doc IDs to check for an exchange, including legacy fallbacks.
 * BYBIT falls back to legacy "binance" doc (pre-migration).
 */
export function getSecretDocIds(exchange: ExchangeName): string[] {
  if (exchange === "BYBIT") return ["bybit", "binance"];
  return [SECRET_DOC_IDS[exchange]];
}

/**
 * Check whether a Firestore secrets doc actually belongs to the requested exchange.
 * Legacy docs (pre-migration) have no `exchange` field — treat them as BYBIT.
 */
export function docMatchesExchange(docData: Record<string, unknown>, exchange: ExchangeName): boolean {
  const storedExchange = docData.exchange as string | undefined;
  if (!storedExchange) return exchange === "BYBIT";
  return storedExchange.toUpperCase() === exchange;
}

export { connectors };
