/**
 * User-facing on-demand stock zones via Dhan option chain (server-only).
 */

import "server-only";
import {
  fetchDhanEquityOptionChain,
  loadDhanEquityOptionChainWithExpiries,
} from "@/lib/dhan-option-chain";
import {
  buildEquityZonesFromStrikes,
  TERM_STRUCTURE_ENABLED,
  type EquityOptionsZones,
  type EquityRegimeInputs,
} from "@/lib/equity-options-zones";
import { computeAtmIv } from "@/lib/zones/vol-regime";

function emptyResult(symbol: string, spot = 0, expiryUsed: string | null = null): EquityOptionsZones {
  return buildEquityZonesFromStrikes(symbol, spot, new Map(), expiryUsed);
}

/**
 * Returns illiquid empty result for thin chains instead of throwing.
 */
export async function computeEquityZonesDhan(
  symbol: string,
  regimeInputs: EquityRegimeInputs = {},
): Promise<EquityOptionsZones> {
  const { snapshot: chain, securityId, expiries } =
    await loadDhanEquityOptionChainWithExpiries(symbol);
  if (chain.spot <= 0 || !chain.strikes.size) {
    return emptyResult(symbol, chain.spot, chain.expiry);
  }

  // Term-structure parity with the NSE path: read the next expiry's ATM IV.
  // Best-effort — a failed/throttled call just leaves term structure unknown.
  let nextAtmIv = regimeInputs.nextAtmIv ?? null;
  if (nextAtmIv == null && TERM_STRUCTURE_ENABLED() && expiries[1]) {
    try {
      const next = await fetchDhanEquityOptionChain(symbol, expiries[1], securityId);
      nextAtmIv = computeAtmIv(next.strikes, chain.spot);
    } catch {
      /* term structure stays unknown */
    }
  }

  return buildEquityZonesFromStrikes(symbol, chain.spot, chain.strikes, chain.expiry, {
    ...regimeInputs,
    nextAtmIv,
  });
}
