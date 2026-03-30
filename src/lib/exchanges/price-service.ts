/**
 * Multi-exchange price service.
 *
 * Fetches prices from all supported exchanges in parallel,
 * caches them in Firestore for workers to read, and provides
 * lookup functions that select the right exchange's price.
 */
import { type ExchangeName, SUPPORTED_EXCHANGES, ALL_EXCHANGES, signalExchangeToPriceBucket } from "./types";
import { getAllConnectors } from "./registry";

export type ExchangePriceMap = Map<string, number>;
export type AllExchangePrices = Record<ExchangeName, ExchangePriceMap>;

/**
 * Fetch current prices from ALL supported exchanges in parallel.
 * Uses Promise.allSettled so one exchange failure doesn't block others.
 */
export async function fetchAllExchangePrices(): Promise<AllExchangePrices> {
  const connectors = getAllConnectors();

  const results = await Promise.allSettled(
    connectors.map(async (c) => ({
      name: c.name,
      prices: await c.getAllPrices(),
    }))
  );

  const prices: AllExchangePrices = {
    BYBIT: new Map(),
    BINANCE: new Map(),
    MEXC: new Map(),
    DHAN: new Map(),
  };

  for (const result of results) {
    if (result.status === "fulfilled") {
      prices[result.value.name] = result.value.prices;
    } else {
      console.error(`[PriceService] Failed to fetch prices:`, result.reason);
    }
  }

  return prices;
}

/**
 * Serialize price maps for Firestore storage.
 * Maps aren't directly storable — convert to plain objects.
 */
export function serializePrices(prices: AllExchangePrices): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const exchange of ALL_EXCHANGES) {
    if (prices[exchange]) result[exchange] = Object.fromEntries(prices[exchange]);
  }
  return result;
}

/**
 * Deserialize Firestore-stored prices back to Maps.
 */
export function deserializePrices(data: Record<string, Record<string, number>>): AllExchangePrices {
  const result: AllExchangePrices = {
    BYBIT: new Map(),
    BINANCE: new Map(),
    MEXC: new Map(),
    DHAN: new Map(),
  };
  for (const exchange of ALL_EXCHANGES) {
    if (data[exchange]) {
      result[exchange] = new Map(Object.entries(data[exchange]));
    }
  }
  return result;
}

/**
 * Look up price for a symbol on a specific exchange.
 * Falls back to Binance if the exchange doesn't have the symbol.
 *
 * Handles symbol normalization: strips .P suffix and tries
 * both raw and +USDT variants.
 */
export function getPrice(
  prices: AllExchangePrices,
  signalSymbol: string,
  exchange: ExchangeName
): number | null {
  const raw = signalSymbol.replace(/\.P$|\.PERP$|\.NS$|\.NSE$/i, "").toUpperCase();

  // Try the target exchange first
  const exchangeMap = prices[exchange];
  if (exchangeMap) {
    const price = exchangeMap.get(raw) ?? exchangeMap.get(raw + "USDT");
    if (price != null) return price;
  }

  // MEXC uses underscored symbols
  if (exchange === "MEXC") {
    const mexcSym = raw.endsWith("USDT") ? raw.slice(0, -4) + "_USDT" : raw + "_USDT";
    const mexcPrice = exchangeMap?.get(mexcSym);
    if (mexcPrice != null) return mexcPrice;
  }

  // Dhan has no fallback — stock prices are exchange-specific
  if (exchange === "DHAN") return null;

  // Fallback to Binance for crypto
  if (exchange !== "BINANCE") {
    const binanceMap = prices.BINANCE;
    const fallback = binanceMap.get(raw) ?? binanceMap.get(raw + "USDT");
    if (fallback != null) return fallback;
  }

  return null;
}

/**
 * Get the price for signal tracking / simulator / scoring.
 * Uses the signal's originating exchange when provided,
 * falling back to Binance if the exchange has no price.
 */
export function getReferencePrice(
  prices: AllExchangePrices,
  signalSymbol: string,
  exchange?: string,
): number | null {
  const ex = exchange ? signalExchangeToPriceBucket(exchange) : "BINANCE";
  return getPrice(prices, signalSymbol, ex);
}

/**
 * Build legacy-compatible flat price maps from AllExchangePrices.
 * Used during migration to maintain backward compat with existing code
 * that expects { [symbol]: price } objects.
 */
export function toLegacyPriceMaps(prices: AllExchangePrices): {
  spotPriceMap: Record<string, number>;
  perpetualsPriceMap: Record<string, number>;
} {
  const binancePrices = prices.BINANCE;
  const spotPriceMap: Record<string, number> = {};
  const perpetualsPriceMap: Record<string, number> = {};

  // Binance futures prices go into perpetuals map
  for (const [symbol, price] of binancePrices) {
    perpetualsPriceMap[symbol] = price;
  }

  return { spotPriceMap, perpetualsPriceMap };
}
