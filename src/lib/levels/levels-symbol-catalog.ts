import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-specs";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { FNO_UNIVERSE_ALPHA } from "@/lib/nse/fno-universe";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export type LevelsSymbolEntry = {
  scope: LevelsTvScope;
  symbol: string;
  label: string;
};

export const LEVELS_SYMBOL_CATALOG: readonly LevelsSymbolEntry[] = [
  ...INDEX_KEYS.map((key) => ({
    scope: "index" as const,
    symbol: key,
    label: INDEX_SPECS[key].label,
  })),
  ...FNO_UNIVERSE_ALPHA.map((symbol) => ({
    scope: "stock" as const,
    symbol,
    label: fnoCompanyName(symbol) ?? symbol,
  })),
];

export function filterLevelsSymbolCatalog(
  query: string,
  limit = 10,
): LevelsSymbolEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const out: LevelsSymbolEntry[] = [];
  for (const entry of LEVELS_SYMBOL_CATALOG) {
    if (
      entry.symbol.includes(q) ||
      entry.label.toUpperCase().includes(q)
    ) {
      out.push(entry);
      if (out.length >= limit) break;
    }
  }
  return out;
}
