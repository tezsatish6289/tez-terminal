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
  /** Net external flow on this day (deposit, withdrawal, manual P&L). */
  flowAmount: number | null;
  flowKind: "in" | "out" | null;
}

function aggregateFlowsByDay(
  flows: CapitalFlowPoint[],
): Map<string, { amount: number; kind: "in" | "out" }> {
  const netByDay = new Map<string, number>();
  for (const f of flows) {
    const ms = parseMs(f.at);
    if (!Number.isFinite(ms)) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    const signed = f.kind === "in" ? f.amount : -f.amount;
    netByDay.set(day, (netByDay.get(day) ?? 0) + signed);
  }

  const result = new Map<string, { amount: number; kind: "in" | "out" }>();
  for (const [day, net] of netByDay) {
    if (Math.abs(net) < 10) continue;
    result.set(day, { amount: Math.abs(net), kind: net > 0 ? "in" : "out" });
  }
  return result;
}

export function buildCapitalCurveChartRows(payload: CapitalCurvePayload): CapitalCurveChartRow[] {
  const daySet = new Set<string>();
  const flowByDay = aggregateFlowsByDay(payload.flows);

  const addDays = (iso: string) => {
    const ms = parseMs(iso);
    if (!Number.isFinite(ms)) return;
    daySet.add(new Date(ms).toISOString().slice(0, 10));
  };

  for (const p of payload.wallet.points) addDays(p.at);
  for (const day of flowByDay.keys()) daySet.add(day);

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

  return days.map((day) => {
    const flow = flowByDay.get(day);
    return {
      day,
      wallet: lastValueOnOrBefore(payload.wallet.points, day),
      flowAmount: flow?.amount ?? null,
      flowKind: flow?.kind ?? null,
    };
  });
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
