/** Compact contract count for OI clusters (e.g. 125k, 1.2M). Mirrors app's format-cluster-size.ts. */
export function formatClusterContracts(contracts: number | null | undefined): string | null {
  if (contracts == null || !Number.isFinite(contracts) || contracts <= 0) return null;
  if (contracts >= 1_000_000) {
    const m = contracts / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
  }
  if (contracts >= 1_000) return `${Math.round(contracts / 1_000)}k`;
  return contracts.toLocaleString("en-IN");
}

/** Strike / price label (e.g. 2,400 or 7.25). */
export function formatPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return p >= 1000
    ? Math.round(p).toLocaleString("en-IN")
    : p.toLocaleString("en-IN", {
        minimumFractionDigits: p < 10 ? 2 : 0,
        maximumFractionDigits: p < 10 ? 2 : 0,
      });
}

/** Signed % distance from spot to a level. */
export function pctFromSpot(spot: number, level: number | null | undefined): string | null {
  if (level == null || !Number.isFinite(level) || spot <= 0) return null;
  const pct = ((level - spot) / spot) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
