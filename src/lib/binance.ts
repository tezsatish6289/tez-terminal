/**
 * Backward-compatibility shim.
 *
 * Re-exports Bybit connector functions with the original names so
 * existing imports across the codebase continue to work unchanged.
 *
 * New code should import from "@/lib/exchanges" instead.
 */
import { BybitConnector } from "./exchanges/bybit";
import {
  type ExchangeCredentials,
  type SymbolInfo,
  type Order,
  type FuturesBalance,
  type FuturesPosition,
  type BatchOrderResult,
  ExchangeApiError,
  floorToStep,
  roundToTick,
  adjustQuantity,
  checkNotional,
  placeExitOrders as _placeExitOrders,
  replaceSl as _replaceSl,
} from "./exchanges/types";

// Singleton connector
const bybit = new BybitConnector();

// ── Re-export types with legacy names ───────────────────────────

export type BinanceCredentials = ExchangeCredentials;
export type BinanceOrder = Order;
export { ExchangeApiError as BinanceApiError };
export type { SymbolInfo, FuturesBalance, FuturesPosition, BatchOrderResult };

// ── Re-export utilities ─────────────────────────────────────────

export { floorToStep, roundToTick, adjustQuantity, checkNotional };

// ── Symbol mapping ──────────────────────────────────────────────

export function toBinanceSymbol(signalSymbol: string): string {
  return bybit.normalizeSymbol(signalSymbol);
}

// ── Exchange info ───────────────────────────────────────────────

export async function getExchangeInfo(forceRefresh = false, testnet?: boolean) {
  return bybit.getExchangeInfo(forceRefresh, testnet);
}

export async function getSymbolInfo(symbol: string, testnet?: boolean) {
  return bybit.getSymbolInfo(symbol, testnet);
}

// ── Account & Position ──────────────────────────────────────────

export async function getBalance(creds: BinanceCredentials) {
  return bybit.getBalance(creds);
}

export async function getUsdtBalance(creds: BinanceCredentials) {
  return bybit.getUsdtBalance(creds);
}

export async function getPositions(creds: BinanceCredentials) {
  return bybit.getPositions(creds);
}

export async function getPosition(symbol: string, creds: BinanceCredentials) {
  return bybit.getPosition(symbol, creds);
}

// ── Margin & Leverage ───────────────────────────────────────────

export async function setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", creds: BinanceCredentials) {
  return bybit.setMarginType(symbol, marginType, creds);
}

export async function setLeverage(symbol: string, leverage: number, creds: BinanceCredentials) {
  return bybit.setLeverage(symbol, leverage, creds);
}

// ── Orders ──────────────────────────────────────────────────────

export async function placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: BinanceCredentials) {
  return bybit.placeMarketOrder(symbol, side, quantity, creds);
}

export async function placeStopMarket(symbol: string, side: "BUY" | "SELL", stopPrice: number, quantity: number, creds: BinanceCredentials, tickSize: number) {
  return bybit.placeStopMarket(symbol, side, stopPrice, quantity, creds, tickSize);
}

export async function placeTakeProfitMarket(symbol: string, side: "BUY" | "SELL", stopPrice: number, quantity: number, creds: BinanceCredentials, tickSize: number) {
  return bybit.placeTakeProfitMarket(symbol, side, stopPrice, quantity, creds, tickSize);
}

export async function placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: BinanceCredentials) {
  return bybit.placeMarketClose(symbol, side, quantity, creds);
}

// ── Order Management ────────────────────────────────────────────

export async function cancelOrder(symbol: string, orderId: string, creds: BinanceCredentials) {
  return bybit.cancelOrder(symbol, orderId, creds);
}

export async function cancelAllOrders(symbol: string, creds: BinanceCredentials) {
  return bybit.cancelAllOrders(symbol, creds);
}

export async function getOpenOrders(symbol: string, creds: BinanceCredentials) {
  return bybit.getOpenOrders(symbol, creds);
}

export async function getOrder(symbol: string, orderId: string, creds: BinanceCredentials) {
  return bybit.getOrder(symbol, orderId, creds);
}

export async function getAllOrders(symbol: string, creds: BinanceCredentials, limit?: number) {
  return bybit.getAllOrders(symbol, creds, limit);
}

// ── Composite Operations ────────────────────────────────────────

export async function placeExitOrders(
  symbol: string, side: "BUY" | "SELL", quantity: number,
  sl: number, tp1: number, tp1ClosePct: number,
  info: SymbolInfo, creds: BinanceCredentials
) {
  return _placeExitOrders(bybit, symbol, side, quantity, sl, tp1, tp1ClosePct, info, creds);
}

export async function replaceSl(
  symbol: string, side: "BUY" | "SELL", oldSlOrderId: string,
  newSlPrice: number, remainingQty: number, info: SymbolInfo, creds: BinanceCredentials
) {
  return _replaceSl(bybit, symbol, side, oldSlOrderId, newSlPrice, remainingQty, info, creds);
}
