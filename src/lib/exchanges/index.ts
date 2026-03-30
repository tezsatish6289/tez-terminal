/**
 * Public API for the exchanges module.
 */
export {
  type ExchangeName,
  type ExchangeConnector,
  type ExchangeCredentials,
  type SymbolInfo,
  type Order,
  type FuturesBalance,
  type FuturesPosition,
  type BatchOrderResult,
  ExchangeApiError,
  SUPPORTED_EXCHANGES,
  STOCK_EXCHANGES,
  ALL_EXCHANGES,
  floorToStep,
  roundToTick,
  adjustQuantity,
  checkNotional,
  placeExitOrders,
  replaceSl,
} from "./types";

export { BybitConnector } from "./bybit";
export { BinanceConnector } from "./binance";
export { MexcConnector } from "./mexc";
export { DhanConnector } from "./dhan";

export {
  getConnector,
  isExchangeSupported,
  getAllConnectors,
  getSecretDocId,
  getSecretDocIds,
  docMatchesExchange,
} from "./registry";

export {
  fetchAllExchangePrices,
  serializePrices,
  deserializePrices,
  getPrice,
  getReferencePrice,
  toLegacyPriceMaps,
  type AllExchangePrices,
  type ExchangePriceMap,
} from "./price-service";
