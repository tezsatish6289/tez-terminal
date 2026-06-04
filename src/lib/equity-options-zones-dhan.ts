/**
 * User-facing on-demand stock zones via Dhan option chain (server-only).
 */

import "server-only";
import { loadDhanEquityOptionChain } from "@/lib/dhan-option-chain";
import {
  buildEquityZonesFromStrikes,
  type EquityOptionsZones,
} from "@/lib/equity-options-zones";

function emptyResult(symbol: string, spot = 0, expiryUsed: string | null = null): EquityOptionsZones {
  return buildEquityZonesFromStrikes(symbol, spot, new Map(), expiryUsed);
}

/**
 * Returns illiquid empty result for thin chains instead of throwing.
 */
export async function computeEquityZonesDhan(symbol: string): Promise<EquityOptionsZones> {
  const chain = await loadDhanEquityOptionChain(symbol);
  if (chain.spot <= 0 || !chain.strikes.size) {
    return emptyResult(symbol, chain.spot, chain.expiry);
  }
  return buildEquityZonesFromStrikes(symbol, chain.spot, chain.strikes, chain.expiry);
}
