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

/** Signed compact OI change for cluster deltas (e.g. +12k, −4k). Null when ~flat. */
export function formatClusterDelta(
  change: number | null | undefined,
  minAbs = 1,
): string | null {
  if (change == null || !Number.isFinite(change) || Math.abs(change) < minAbs) return null;
  const sign = change > 0 ? "+" : "−";
  const mag = formatClusterContracts(Math.abs(change));
  return mag ? `${sign}${mag}` : null;
}

/** Strike price for cluster peak labels (e.g. 24,500). */
export function formatClusterStrike(strike: number | null | undefined): string | null {
  if (strike == null || !Number.isFinite(strike)) return null;
  return strike >= 1000
    ? Math.round(strike).toLocaleString("en-IN")
    : strike.toLocaleString("en-IN", {
        minimumFractionDigits: strike < 10 ? 2 : 0,
        maximumFractionDigits: strike < 10 ? 2 : 0,
      });
}

/** Chart label: "Put OI peak — 125k @ 24,000  ▲12k". */
export function formatClusterPeakLabel(
  side: "Put" | "Call",
  contracts: number | null | undefined,
  strike: number | null | undefined,
  change?: number | null,
): string | null {
  const size = formatClusterContracts(contracts);
  if (!size) return null;
  const strikeText = formatClusterStrike(strike);
  const base = strikeText
    ? `${side} OI peak — ${size} @ ${strikeText}`
    : `${side} OI peak — ${size}`;
  const delta = formatClusterDelta(change);
  if (!delta) return base;
  const arrow = (change ?? 0) >= 0 ? "▲" : "▼";
  return `${base}  ${arrow}${delta.replace(/^[+−]/, "")}`;
}
