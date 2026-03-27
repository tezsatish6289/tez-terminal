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

const connectors: Record<ExchangeName, ExchangeConnector> = {
  BYBIT: new BybitConnector(),
  BINANCE: new BinanceConnector(),
  MEXC: new MexcConnector(),
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

export { connectors };
