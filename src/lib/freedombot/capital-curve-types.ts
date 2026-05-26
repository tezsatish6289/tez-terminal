/** Shared types for capital curve API + dashboard chart (client-safe). */

export interface CapitalCurvePoint {
  at: string;
  value: number;
}

export interface CapitalFlowPoint {
  at: string;
  amount: number;
  kind: "in" | "out";
}

export interface BotCapitalSeries {
  deploymentId: string;
  bot: string;
  label: string;
  deployedAt: string;
  baselineUsd: number;
  totalPnlUsd: number;
  returnPct: number | null;
  points: CapitalCurvePoint[];
}

/** All bots on one exchange — baseline at first deploy + combined closed P&L. */
export interface CombinedBotCapitalSeries {
  baselineUsd: number;
  totalPnlUsd: number;
  returnPct: number | null;
  firstDeployAt: string;
  points: CapitalCurvePoint[];
}

export interface CapitalCurvePayload {
  exchange: string;
  currency: string;
  wallet: {
    points: CapitalCurvePoint[];
    latest: number | null;
  };
  combinedBots: CombinedBotCapitalSeries;
  bots: BotCapitalSeries[];
  flows: CapitalFlowPoint[];
  hasWalletHistory: boolean;
}

function parseMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

export interface CapitalCurveChartRow {
  day: string;
  wallet: number | null;
}

export function buildCapitalCurveChartRows(payload: CapitalCurvePayload): CapitalCurveChartRow[] {
  const daySet = new Set<string>();

  const addDays = (iso: string) => {
    const ms = parseMs(iso);
    if (!Number.isFinite(ms)) return;
    daySet.add(new Date(ms).toISOString().slice(0, 10));
  };

  for (const p of payload.wallet.points) addDays(p.at);

  const days = [...daySet].sort();

  const lastValueOnOrBefore = (
    points: CapitalCurvePoint[],
    day: string,
  ): number | null => {
    const endMs = new Date(`${day}T23:59:59.999Z`).getTime();
    let best: number | null = null;
    let bestMs = -Infinity;
    for (const p of points) {
      const ms = parseMs(p.at);
      if (!Number.isFinite(ms) || ms > endMs) continue;
      if (ms >= bestMs) {
        bestMs = ms;
        best = p.value;
      }
    }
    return best;
  };

  return days.map((day) => ({
    day,
    wallet: lastValueOnOrBefore(payload.wallet.points, day),
  }));
}

/** Zoom Y-axis to the wallet line. */
export function computeCapitalCurveYDomain(
  chartRows: CapitalCurveChartRow[],
): [number, number] {
  const values: number[] = [];
  for (const row of chartRows) {
    if (typeof row.wallet === "number") values.push(row.wallet);
  }
  if (values.length === 0) return [0, 100];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const mid = (min + max) / 2;
  const effectiveRange = range > 0 ? range : Math.max(Math.abs(mid) * 0.05, 1);
  const pad = Math.max(effectiveRange * 0.12, Math.abs(mid) * 0.03, 2);

  return [
    Math.floor((min - pad) * 100) / 100,
    Math.ceil((max + pad) * 100) / 100,
  ];
}
