import { FNO_UNIVERSE } from "@/lib/nse/fno-universe";

export function normalizeStockSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
}

export function isValidFnoSymbol(symbol: string): boolean {
  return FNO_UNIVERSE.includes(normalizeStockSymbol(symbol));
}
