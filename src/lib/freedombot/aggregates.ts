/**
 * Per-deployment aggregates: cached counts + lifetime realised P&L.
 *
 * Stored on `bot_deployments/{id}`:
 *   - openTradeCount         number          OPEN trades for this deployment
 *   - closedTradeCount       number          CLOSED trades for this deployment
 *   - lifetimeRealizedPnl    number          Σ bestRealizedPnl(t) for closed trades
 *   - aggregatesBot          string          deploy key scope (CRYPTO, BTC, …)
 *   - aggregatesUpdatedAt    ISO string      last write time (delta or rebuild)
 *   - aggregatesBootstrappedAt ISO string    last full rebuild (drift heal anchor)
 *
 * Scoped by (uid, exchange, bot) — each deployment only counts live_trades whose
 * `botSource` matches that bot's catalog source (PATTERN for Crypto Bot, etc.).
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  deployBotFromTradeSource,
  tradeMatchesDeployBot,
} from "@/lib/freedombot/trade-bot-match";
import { bestRealizedPnl, type TradeForPnl } from "./compute-best-pnl";

export { botSourceForDeployKey, tradeMatchesDeployBot } from "@/lib/freedombot/trade-bot-match";

// ── Cached fields on bot_deployments ───────────────────────────────────────

export interface DeploymentAggregateFields {
  openTradeCount?: number;
  closedTradeCount?: number;
  lifetimeRealizedPnl?: number;
  aggregatesBot?: string;
  aggregatesUpdatedAt?: string;
  aggregatesBootstrappedAt?: string;
}

export interface ResolvedDeploymentAggregates {
  openTradeCount: number;
  closedTradeCount: number;
  lifetimeRealizedPnl: number;
  source: "cache" | "rebuilt";
}

const AGG_FIELDS = [
  "openTradeCount",
  "closedTradeCount",
  "lifetimeRealizedPnl",
] as const;

function hasFullCache(d: DeploymentAggregateFields): boolean {
  return AGG_FIELDS.every(
    (k) => typeof d[k] === "number" && Number.isFinite(d[k] as number),
  );
}

function pickCachedAggregates(
  d: DeploymentAggregateFields,
  deployBot: string,
): ResolvedDeploymentAggregates | null {
  if (!hasFullCache(d)) return null;
  // Legacy rows cached exchange-wide (no bot scope) must rebuild per deployment.
  if (d.aggregatesBot == null || d.aggregatesBot !== deployBot) return null;
  return {
    openTradeCount: Number(d.openTradeCount ?? 0),
    closedTradeCount: Number(d.closedTradeCount ?? 0),
    lifetimeRealizedPnl: Number(d.lifetimeRealizedPnl ?? 0),
    source: "cache",
  };
}

// ── Trade snapshot used to compute per-trade contribution ──────────────────

/** Fields needed to (a) decide if a trade is closed and (b) resolve bestRealizedPnl. */
export type TradeAggregateSnapshot = TradeForPnl & {
  userId?: string | null;
  status?: string | null;
  exchange?: string | null;
  testnet?: boolean | null;
  botSource?: string | null;
};

function isClosed(t: TradeAggregateSnapshot | null | undefined): boolean {
  if (!t) return false;
  return String(t.status ?? "").toUpperCase() === "CLOSED";
}

function isOpen(t: TradeAggregateSnapshot | null | undefined): boolean {
  if (!t) return false;
  return String(t.status ?? "").toUpperCase() === "OPEN";
}

function pnlContribution(t: TradeAggregateSnapshot | null | undefined): number {
  if (!isClosed(t)) return 0;
  const best = bestRealizedPnl(t!);
  return best?.value ?? 0;
}

// ── Deployment lookup ──────────────────────────────────────────────────────

async function findDeploymentRefsForBot(
  db: Firestore,
  uid: string,
  exchange: string,
  deployBot: string,
): Promise<FirebaseFirestore.DocumentReference[]> {
  if (!uid || !exchange || !deployBot) return [];
  const snap = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .where("bot", "==", deployBot)
    .get();
  return snap.docs.map((d) => d.ref);
}

// ── Hot path: atomic increments ────────────────────────────────────────────

interface CountDelta {
  closed: number;
  open: number;
  pnl: number;
}

function diffSnapshots(
  before: TradeAggregateSnapshot | null,
  after: TradeAggregateSnapshot,
): CountDelta {
  const wasClosed = isClosed(before);
  const isClosedNow = isClosed(after);
  const wasOpen = isOpen(before);
  const isOpenNow = isOpen(after);
  const oldPnl = pnlContribution(before);
  const newPnl = pnlContribution(after);
  return {
    closed: (isClosedNow ? 1 : 0) - (wasClosed ? 1 : 0),
    open: (isOpenNow ? 1 : 0) - (wasOpen ? 1 : 0),
    pnl: newPnl - oldPnl,
  };
}

/**
 * Apply the (before → after) trade transition to matching deployment(s) for
 * this trade's bot source only.
 */
export async function applyTradeChangeToAggregates(
  db: Firestore,
  before: TradeAggregateSnapshot | null,
  after: TradeAggregateSnapshot,
): Promise<void> {
  if (after.testnet !== false) return;
  if (before != null && before.testnet !== false) return;

  const uid = String((before?.userId ?? after.userId ?? "")).trim();
  const exchange = String((before?.exchange ?? after.exchange ?? "")).trim();
  if (!uid || !exchange) return;

  const delta = diffSnapshots(before, after);
  if (delta.closed === 0 && delta.open === 0 && delta.pnl === 0) return;

  const deployBot = deployBotFromTradeSource(after.botSource ?? before?.botSource);
  const refs = await findDeploymentRefsForBot(db, uid, exchange, deployBot);
  if (refs.length === 0) return;

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    aggregatesUpdatedAt: nowIso,
    aggregatesBot: deployBot,
  };
  if (delta.closed !== 0) {
    updates.closedTradeCount = FieldValue.increment(delta.closed);
  }
  if (delta.open !== 0) {
    updates.openTradeCount = FieldValue.increment(delta.open);
  }
  if (delta.pnl !== 0) {
    updates.lifetimeRealizedPnl = FieldValue.increment(
      Number(delta.pnl.toFixed(6)),
    );
  }

  await Promise.all(
    refs.map((ref) =>
      ref.update(updates).catch((err) => {
        console.warn(
          `[aggregates] increment failed for ${ref.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    ),
  );
}

// ── Cold path: full rebuild ────────────────────────────────────────────────

interface RebuildTotals {
  openTradeCount: number;
  closedTradeCount: number;
  lifetimeRealizedPnl: number;
}

/** Pull production trades for (uid, exchange, bot) and recompute totals. */
export async function computeAggregatesFromTrades(
  db: Firestore,
  uid: string,
  exchange: string,
  deployBot: string,
): Promise<RebuildTotals> {
  let openTradeCount = 0;
  let closedTradeCount = 0;
  let lifetimeRealizedPnl = 0;

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const PAGE = 400;
  while (true) {
    let q: FirebaseFirestore.Query = db
      .collection("live_trades")
      .where("userId", "==", uid)
      .where("exchange", "==", exchange)
      .where("testnet", "==", false)
      .orderBy("openedAt", "asc")
      .limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    for (const doc of snap.docs) {
      const t = doc.data() as TradeAggregateSnapshot;
      if (!tradeMatchesDeployBot(t, deployBot)) continue;
      if (isClosed(t)) {
        closedTradeCount++;
        const best = bestRealizedPnl(t);
        if (best) lifetimeRealizedPnl += best.value;
      } else if (isOpen(t)) {
        openTradeCount++;
      }
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return {
    openTradeCount,
    closedTradeCount,
    lifetimeRealizedPnl: Number(lifetimeRealizedPnl.toFixed(6)),
  };
}

/** Rebuild and persist aggregates for one bot on an exchange. */
export async function rebuildDeploymentAggregates(
  db: Firestore,
  uid: string,
  exchange: string,
  deployBot: string,
): Promise<RebuildTotals> {
  const totals = await computeAggregatesFromTrades(db, uid, exchange, deployBot);
  const refs = await findDeploymentRefsForBot(db, uid, exchange, deployBot);
  if (refs.length === 0) return totals;
  const nowIso = new Date().toISOString();
  const patch = {
    ...totals,
    aggregatesBot: deployBot,
    aggregatesUpdatedAt: nowIso,
    aggregatesBootstrappedAt: nowIso,
  };
  await Promise.all(refs.map((ref) => ref.update(patch).catch(() => {})));
  return totals;
}

/** Rebuild every distinct bot deployment on an exchange (e.g. after bulk reconcile). */
export async function rebuildAllDeploymentsOnExchange(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<void> {
  const snap = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .get();
  const bots = new Set(
    snap.docs.map((d) => String(d.data().bot ?? "CRYPTO")).filter(Boolean),
  );
  await Promise.all(
    [...bots].map((bot) => rebuildDeploymentAggregates(db, uid, exchange, bot)),
  );
}

// ── Read path: cache-first with bootstrap fallback ─────────────────────────

export async function getDeploymentAggregates(
  db: Firestore,
  deployment: { uid: string; exchange: string; bot?: string } & DeploymentAggregateFields,
): Promise<ResolvedDeploymentAggregates> {
  const deployBot = String(deployment.bot ?? "CRYPTO");
  const cached = pickCachedAggregates(deployment, deployBot);
  if (cached) return cached;
  const fresh = await rebuildDeploymentAggregates(
    db,
    deployment.uid,
    deployment.exchange,
    deployBot,
  );
  return { ...fresh, source: "rebuilt" };
}
