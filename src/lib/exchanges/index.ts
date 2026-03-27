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

export { getConnector, isExchangeSupported, getAllConnectors } from "./registry";

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
