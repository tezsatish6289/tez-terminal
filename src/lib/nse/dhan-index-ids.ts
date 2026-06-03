import type { IndexKey } from "@/lib/index-options-zones";

/**
 * Dhan `securityId` for NSE index symbols (IDX_I / INDEX segment).
 * From Dhan scrip master — stable exchange standard IDs.
 */
export const DHAN_INDEX_SECURITY_ID: Record<IndexKey, number> = {
  NIFTY: 13,
  BANKNIFTY: 25,
  FINNIFTY: 27,
  MIDCPNIFTY: 442,
  NIFTYNXT50: 38,
};

const INDEX_KEY_SET = new Set<string>(Object.keys(DHAN_INDEX_SECURITY_ID));

export function isNseIndexKey(symbol: string): symbol is IndexKey {
  return INDEX_KEY_SET.has(symbol.trim().toUpperCase());
}

export function normalizeIndexKey(symbol: string): IndexKey | null {
  const upper = symbol.trim().toUpperCase();
  return isNseIndexKey(upper) ? upper : null;
}

export function dhanIndexSecurityId(symbol: string): number | null {
  const key = normalizeIndexKey(symbol);
  return key ? DHAN_INDEX_SECURITY_ID[key] : null;
}
