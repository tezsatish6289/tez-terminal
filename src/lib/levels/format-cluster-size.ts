/** Compact contract count for option-cluster open interest (e.g. 125k). */
export function formatClusterContracts(contracts: number | null | undefined): string | null {
  if (contracts == null || !Number.isFinite(contracts) || contracts <= 0) return null;
  if (contracts >= 1_000_000) {
    const m = contracts / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
  }
  if (contracts >= 1_000) return `${Math.round(contracts / 1_000)}k`;
  return contracts.toLocaleString("en-IN");
}
