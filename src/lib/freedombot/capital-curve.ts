/**
 * Build capital-curve series for one user + exchange:
 *   - Wallet line (real ledger snapshots only — no P&L backfill)
 *   - Combined + per-bot lines (baseline at deploy + closed P&L)
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { cryptoBotByDeployKey, type DeployBotKey } from "@/lib/crypto-bots";
import { bestRealizedPnl, type TradeForPnl } from "@/lib/freedombot/compute-best-pnl";
import { listWalletSnapshots } from "@/lib/freedombot/capital-ledger";
import { tradeMatchesDeployBot } from "@/lib/freedombot/trade-bot-match";
import { walletCurrencyFor } from "@/lib/freedombot/wallet-balance";

export interface CapitalCurveDeployment {
  id: string;
  bot: string;
  createdAt: string;
  walletTotal?: number | null;
  walletCheckedAt?: string | null;
}

import type {
  BotCapitalSeries,
  CapitalCurvePayload,
  CapitalCurvePoint,
  CapitalFlowPoint,
  CombinedBotCapitalSeries,
} from "@/lib/freedombot/capital-curve-types";

export type {
  BotCapitalSeries,
  CapitalCurvePayload,
  CapitalCurvePoint,
  CapitalFlowPoint,
  CombinedBotCapitalSeries,
} from "@/lib/freedombot/capital-curve-types";

type ClosedTradeRow = TradeForPnl & {
  botSource?: string | null;
  closedAt?: string | null;
  openedAt?: string | null;
  status?: string;
};

function parseMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function botLabel(deployBot: string): string {
  try {
    return cryptoBotByDeployKey(deployBot as DeployBotKey).label;
  } catch {
    return deployBot;
  }
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Shared wallet estimate at time T: current − Σ P&L closed strictly after T. */
function estimateWalletAt(
  anchorMs: number,
  anchorWallet: number,
  trades: { closedMs: number; pnl: number }[],
): number {
  let after = 0;
  for (const t of trades) {
    if (t.closedMs > anchorMs) after += t.pnl;
  }
  return roundUsd(anchorWallet - after);
}

async function loadClosedTradesForExchange(
  db: Firestore,
  userId: string,
  exchange: string,
): Promise<{ closedMs: number; closedAt: string; pnl: number; botSource: string | null }[]> {
  const rows: { closedMs: number; closedAt: string; pnl: number; botSource: string | null }[] = [];
  let lastDoc: QueryDocumentSnapshot | null = null;
  const PAGE = 400;

  while (true) {
    let q = db
      .collection("live_trades")
      .where("userId", "==", userId)
      .where("exchange", "==", exchange)
      .where("status", "==", "CLOSED")
      .where("testnet", "==", false)
      .orderBy("openedAt", "asc")
      .limit(PAGE);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    for (const doc of snap.docs) {
      const d = doc.data() as ClosedTradeRow;
      const best = bestRealizedPnl(d);
      if (!best) continue;
      const closedAt =
        typeof d.closedAt === "string"
          ? d.closedAt
          : typeof d.openedAt === "string"
            ? d.openedAt
            : null;
      const closedMs = parseMs(closedAt);
      if (!Number.isFinite(closedMs)) continue;
      rows.push({
        closedMs,
        closedAt: closedAt!,
        pnl: best.value,
        botSource: d.botSource ?? null,
      });
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  rows.sort((a, b) => a.closedMs - b.closedMs);
  return rows;
}

export async function buildCapitalCurveForExchange(
  db: Firestore,
  userId: string,
  exchange: string,
  deployments: CapitalCurveDeployment[],
): Promise<CapitalCurvePayload> {
  const ex = String(exchange).toUpperCase();
  const deps = deployments;

  const trades = await loadClosedTradesForExchange(db, userId, ex);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  const ledgerSnapshots = await listWalletSnapshots(db, userId, ex);

  let latestWallet: number | null = null;
  let latestAt: string | null = null;
  for (const d of deps) {
    if (typeof d.walletTotal !== "number" || !Number.isFinite(d.walletTotal)) continue;
    const at = typeof d.walletCheckedAt === "string" ? d.walletCheckedAt : new Date().toISOString();
    const ms = parseMs(at);
    if (latestWallet == null || ms > parseMs(latestAt)) {
      latestWallet = d.walletTotal;
      latestAt = at;
    }
  }

  const anchorWallet =
    ledgerSnapshots.length > 0
      ? ledgerSnapshots[ledgerSnapshots.length - 1].amount
      : latestWallet;

  const walletPoints: CapitalCurvePoint[] = [];

  for (const s of ledgerSnapshots) {
    walletPoints.push({ at: s.at, value: roundUsd(s.amount) });
  }

  if (
    latestWallet != null &&
    latestAt &&
    (walletPoints.length === 0 ||
      parseMs(latestAt) > parseMs(walletPoints[walletPoints.length - 1].at))
  ) {
    walletPoints.push({ at: latestAt, value: roundUsd(latestWallet) });
  }

  const flows: CapitalFlowPoint[] = [];
  // External-flow inference disabled: comparing frequent wallet snapshots to
  // closed-trade P&L produces false deposit/withdrawal signals (open-position
  // mark moves, fees, refresh timing). Re-enable only with explicit
  // exchange deposit/withdrawal data or a proven reconciliation model.

  const bots: BotCapitalSeries[] = [];
  const sortedDeps = [...deps].sort(
    (a, b) => parseMs(a.createdAt) - parseMs(b.createdAt),
  );

  const walletAnchor =
    anchorWallet ??
    (latestWallet != null ? latestWallet - totalPnl : 0);

  const firstDeploy = sortedDeps[0];
  const firstDeployAt = firstDeploy?.createdAt ?? new Date().toISOString();
  const firstDeployMs = parseMs(firstDeployAt);
  const combinedBaseline =
    Number.isFinite(firstDeployMs) && walletAnchor != null
      ? estimateWalletAt(firstDeployMs, walletAnchor, trades)
      : walletAnchor ?? 0;

  const combinedPoints: CapitalCurvePoint[] = firstDeploy
    ? [{ at: firstDeployAt, value: combinedBaseline }]
    : [];
  let combinedCum = 0;
  for (const tr of trades) {
    if (Number.isFinite(firstDeployMs) && tr.closedMs < firstDeployMs) continue;
    combinedCum += tr.pnl;
    combinedPoints.push({
      at: tr.closedAt,
      value: roundUsd(combinedBaseline + combinedCum),
    });
  }
  const combinedTotalPnl = roundUsd(combinedCum);
  const combinedBots: CombinedBotCapitalSeries = {
    baselineUsd: combinedBaseline,
    totalPnlUsd: combinedTotalPnl,
    returnPct:
      combinedBaseline > 0
        ? roundUsd((combinedTotalPnl / combinedBaseline) * 10000) / 100
        : null,
    firstDeployAt,
    points: combinedPoints,
  };

  for (const dep of sortedDeps) {
    const deployAt = dep.createdAt;
    const deployMs = parseMs(deployAt);
    const baseline =
      Number.isFinite(deployMs) && walletAnchor != null
        ? estimateWalletAt(deployMs, walletAnchor, trades)
        : walletAnchor ?? 0;

    const points: CapitalCurvePoint[] = [{ at: deployAt, value: baseline }];
    let cum = 0;

    for (const tr of trades) {
      if (!tradeMatchesDeployBot({ botSource: tr.botSource }, dep.bot)) continue;
      cum += tr.pnl;
      points.push({
        at: tr.closedAt,
        value: roundUsd(baseline + cum),
      });
    }

    const totalPnlUsd = roundUsd(cum);
    const returnPct =
      baseline > 0 ? roundUsd((totalPnlUsd / baseline) * 10000) / 100 : null;

    bots.push({
      deploymentId: dep.id,
      bot: dep.bot,
      label: botLabel(dep.bot),
      deployedAt: deployAt,
      baselineUsd: baseline,
      totalPnlUsd,
      returnPct,
      points,
    });
  }

  return {
    exchange: ex,
    currency: walletCurrencyFor(ex),
    wallet: {
      points: walletPoints,
      latest: latestWallet != null ? roundUsd(latestWallet) : null,
    },
    combinedBots,
    bots,
    flows,
    hasWalletHistory: ledgerSnapshots.length > 0,
  };
}
