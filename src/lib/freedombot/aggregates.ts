/**
 * Per-deployment aggregates: cached counts + lifetime realised P&L.
 *
 * Stored on `bot_deployments/{id}`:
 *   - openTradeCount         number          OPEN trades for (uid, exchange)
 *   - closedTradeCount       number          CLOSED trades for (uid, exchange)
 *   - lifetimeRealizedPnl    number          Σ bestRealizedPnl(t) for closed trades
 *   - aggregatesUpdatedAt    ISO string      last write time (delta or rebuild)
 *   - aggregatesBootstrappedAt ISO string    last full rebuild (drift heal anchor)
 *
 * Source of truth is still the `live_trades` collection. These are caches that
 * make read paths O(1):
 *
 *   - Hot path: atomic FieldValue.increment on trade open / close, plus a
 *     delta when reconciliation flips a per-trade `bestRealizedPnl` value.
 *   - Cold path: full recompute walks every closed trade and overwrites the
 *     cache. Heals drift from manual overrides, dropped writes, etc.
 *   - Reads bootstrap themselves: if any cache field is missing, the reader
 *     calls `rebuildDeploymentAggregates` once and persists the result.
 *
 * Aggregates are scoped by (uid, exchange) — same scope as
 * `sumLifetimeRealizedPnlForUserExchange`. We mirror the cache onto every
 * deployment doc that matches the pair, so any of the page handlers can read
 * the right number with a single `doc().get()`.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { bestRealizedPnl, type TradeForPnl } from "./compute-best-pnl";

// ── Cached fields on bot_deployments ───────────────────────────────────────

export interface DeploymentAggregateFields {
  openTradeCount?: number;
  closedTradeCount?: number;
  lifetimeRealizedPnl?: number;
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
): ResolvedDeploymentAggregates | null {
  if (!hasFullCache(d)) return null;
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

/**
 * Returns every deployment doc that matches (uid, exchange).
 *
 * In practice there's usually exactly one (deploy creates one row per pair),
 * but a user could have stale rows after delete + redeploy. We update all of
 * them so any of the page handlers reading a doc by id sees a consistent
 * cache. Skips docs whose update would be wasted.
 */
async function findMatchingDeploymentRefs(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<FirebaseFirestore.DocumentReference[]> {
  if (!uid || !exchange) return [];
  const snap = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .get();
  return snap.docs.map((d) => d.ref);
}

// ── Hot path: atomic increments ────────────────────────────────────────────

interface CountDelta {
  closed: number;          // +1 / -1 / 0
  open: number;            // +1 / -1 / 0
  pnl: number;             // signed delta in USD
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
 * Apply the (before → after) trade transition to every matching deployment's
 * cached aggregates. Safe to call after every Firestore write that touches a
 * `live_trades` doc — diff comes out to 0/0/0 when nothing aggregate-relevant
 * changed (e.g. a pure unrealizedPnl tick), which we skip.
 *
 * Pass `before = null` only for brand-new trade docs.
 */
export async function applyTradeChangeToAggregates(
  db: Firestore,
  before: TradeAggregateSnapshot | null,
  after: TradeAggregateSnapshot,
): Promise<void> {
  // Production-only. Match the cold-path filter exactly
  // (`where("testnet", "==", false)`) so hot deltas and rebuilds agree:
  //   - undefined `testnet` (legacy rows) → not counted
  //   - true `testnet` (testnet trades) → not counted
  //   - false `testnet` (production) → counted
  if (after.testnet !== false) return;
  if (before != null && before.testnet !== false) return;

  const uid = String((before?.userId ?? after.userId ?? "")).trim();
  const exchange = String((before?.exchange ?? after.exchange ?? "")).trim();
  if (!uid || !exchange) return;

  const delta = diffSnapshots(before, after);
  if (delta.closed === 0 && delta.open === 0 && delta.pnl === 0) return;

  const refs = await findMatchingDeploymentRefs(db, uid, exchange);
  if (refs.length === 0) return;

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    aggregatesUpdatedAt: nowIso,
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
        // Aggregate updates must never block the underlying trade write —
        // log + ignore. Cold-path rebuild will reconcile any drift.
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

/** Pull every production trade for (uid, exchange) and recompute totals from scratch. */
export async function computeAggregatesFromTrades(
  db: Firestore,
  uid: string,
  exchange: string,
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

/** Compute totals once and persist them to every matching deployment doc. */
export async function rebuildDeploymentAggregates(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<RebuildTotals> {
  const totals = await computeAggregatesFromTrades(db, uid, exchange);
  const refs = await findMatchingDeploymentRefs(db, uid, exchange);
  if (refs.length === 0) return totals;
  const nowIso = new Date().toISOString();
  const patch = {
    ...totals,
    aggregatesUpdatedAt: nowIso,
    aggregatesBootstrappedAt: nowIso,
  };
  await Promise.all(refs.map((ref) => ref.update(patch).catch(() => {})));
  return totals;
}

// ── Read path: cache-first with bootstrap fallback ─────────────────────────

/**
 * Resolve aggregates for one deployment.
 *
 *   - If the deployment doc already carries a complete cache, return it (O(1)).
 *   - Otherwise rebuild from the live_trades collection, persist back to every
 *     matching deployment, and return the fresh totals.
 */
export async function getDeploymentAggregates(
  db: Firestore,
  deployment: { uid: string; exchange: string } & DeploymentAggregateFields,
): Promise<ResolvedDeploymentAggregates> {
  const cached = pickCachedAggregates(deployment);
  if (cached) return cached;
  const fresh = await rebuildDeploymentAggregates(db, deployment.uid, deployment.exchange);
  return { ...fresh, source: "rebuilt" };
}
