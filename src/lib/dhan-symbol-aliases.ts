/**
 * NSE F&O tickers that differ from Dhan's `SEM_TRADING_SYMBOL` in the scrip master.
 * Sync tries each candidate in order until a match is found.
 */
export const DHAN_SYMBOL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  LTIM: ["LTIMINDTREE", "LTI", "MINDTREE"],
  TATAMOTORS: ["TMPV", "TATAMOTORS"],
};

/** All symbols to try when resolving an F&O name against the Dhan master. */
export function dhanSymbolCandidates(fnoSymbol: string): string[] {
  const upper = fnoSymbol.trim().toUpperCase();
  const aliases = DHAN_SYMBOL_ALIASES[upper] ?? [];
  return [...new Set([upper, ...aliases])];
}
