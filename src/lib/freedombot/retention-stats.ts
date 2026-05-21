/**
 * Retention intervention stats — days-to-sustained-profit cohort per exchange.
 *
 * Precomputed daily by `/api/cron/compute-retention-stats` into
 * `config/freedombot_retention_stats/{EXCHANGE}` and read by the dashboard
 * pause/delete modal via `/api/freedombot/retention-stats`.
 */

import type {
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { bestRealizedPnl, type TradeForPnl } from "./compute-best-pnl";
import {
  RETENTION_FALLBACK_P90_DAYS,
  RETENTION_MIN_SAMPLE_SIZE,
  type RetentionExchangeStats,
  type RetentionStatsSource,
} from "./retention-stats-shared";

export {
  RETENTION_FALLBACK_P90_DAYS,
  RETENTION_MIN_SAMPLE_SIZE,
  type RetentionExchangeStats,
  type RetentionStatsSource,
} from "./retention-stats-shared";

export const RETENTION_STATS_COLLECTION = "config";
export const RETENTION_STATS_DOC_PREFIX = "freedombot_retention_stats_";

/** Crypto venues on the FreedomBot dashboard (must match deploy). */
export const FREEDOMBOT_RETENTION_EXCHANGES = ["BYBIT", "COINDCX", "HYPERLIQUID"] as const;

export type FreedombotRetentionExchange = (typeof FREEDOMBOT_RETENTION_EXCHANGES)[number];

/** Cohort quality gates per (uid, exchange). */
export const RETENTION_MIN_CLOSED_TRADES = 5;
export const RETENTION_MIN_SPAN_DAYS = 14;

export interface ClosedTradeRow extends TradeForPnl {
  openedAt?: string | null;
  closedAt?: string | null;
  status?: string | null;
  testnet?: boolean | null;
  userId?: string | null;
  exchange?: string | null;
}

function retentionDocId(exchange: string): string {
  return `${RETENTION_STATS_DOC_PREFIX}${String(exchange).toUpperCase()}`;
}

export function retentionDocRef(db: Firestore, exchange: string) {
  return db.collection(RETENTION_STATS_COLLECTION).doc(retentionDocId(exchange));
}

function parseIsoMs(iso: unknown): number | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Whole calendar days between two timestamps (floor). */
export function calendarDaysBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function isProductionTrade(testnet: unknown): boolean {
  return testnet !== true;
}

function isClosedTrade(status: unknown): boolean {
  return String(status ?? "").toUpperCase() === "CLOSED";
}

function sortKeyMs(t: ClosedTradeRow): number {
  return parseIsoMs(t.closedAt) ?? parseIsoMs(t.openedAt) ?? 0;
}

/**
 * First close where cumulative realised P&L is ≥ 0 and never dips below 0
 * afterward. Returns null if the account never sustained profit.
 */
export function computeDaysToSustainedProfit(
  trades: ClosedTradeRow[],
): number | null {
  if (trades.length < RETENTION_MIN_CLOSED_TRADES) return null;

  const sorted = [...trades].sort((a, b) => sortKeyMs(a) - sortKeyMs(b));

  let firstOpenMs: number | null = null;
  for (const t of sorted) {
    const o = parseIsoMs(t.openedAt);
    if (o != null) {
      firstOpenMs = firstOpenMs == null ? o : Math.min(firstOpenMs, o);
    }
  }
  if (firstOpenMs == null) return null;

  let cumulative = 0;
  let sustainedCloseMs: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    const best = bestRealizedPnl(t);
    cumulative += best?.value ?? 0;

    if (cumulative < 0) {
      sustainedCloseMs = null;
      continue;
    }

    if (sustainedCloseMs == null) {
      const closeMs = parseIsoMs(t.closedAt) ?? parseIsoMs(t.openedAt);
      if (closeMs == null) {
        sustainedCloseMs = null;
        continue;
      }

      let ok = true;
      let run = cumulative;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = bestRealizedPnl(sorted[j]!);
        run += b?.value ?? 0;
        if (run < 0) {
          ok = false;
          break;
        }
      }
      if (ok) sustainedCloseMs = closeMs;
    }
  }

  if (sustainedCloseMs == null) return null;

  const days = calendarDaysBetween(firstOpenMs, sustainedCloseMs);
  if (days < RETENTION_MIN_SPAN_DAYS) return null;
  return days;
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return RETENTION_FALLBACK_P90_DAYS;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

export function buildFallbackExchangeStats(exchange: string): RetentionExchangeStats {
  const now = new Date().toISOString();
  return {
    exchange: String(exchange).toUpperCase(),
    p90DaysToSustainedProfit: RETENTION_FALLBACK_P90_DAYS,
    sampleSize: 0,
    medianDays: null,
    computedAt: now,
    source: "fallback",
  };
}

export interface PairTradeBucket {
  userId: string;
  exchange: string;
  trades: ClosedTradeRow[];
}

/**
 * Group closed production trades by (uid, exchange) and compute per-exchange
 * p90 days-to-sustained-profit for accounts in `allowedPairs`.
 */
export function computeRetentionStatsByExchange(
  tradeRows: ClosedTradeRow[],
  allowedPairs: Set<string>,
): Map<string, RetentionExchangeStats> {
  const pairKey = (uid: string, exchange: string) =>
    `${uid}::${String(exchange).toUpperCase()}`;

  const buckets = new Map<string, PairTradeBucket>();

  for (const t of tradeRows) {
    if (!isProductionTrade(t.testnet) || !isClosedTrade(t.status)) continue;
    const uid = String(t.userId ?? "");
    const exchange = String(t.exchange ?? "").toUpperCase();
    if (!uid || !exchange) continue;
    const key = pairKey(uid, exchange);
    if (!allowedPairs.has(key)) continue;

    const bucket = buckets.get(key) ?? { userId: uid, exchange, trades: [] };
    bucket.trades.push(t);
    buckets.set(key, bucket);
  }

  const daysByExchange = new Map<string, number[]>();

  for (const bucket of buckets.values()) {
    const days = computeDaysToSustainedProfit(bucket.trades);
    if (days == null) continue;
    const ex = bucket.exchange;
    const list = daysByExchange.get(ex) ?? [];
    list.push(days);
    daysByExchange.set(ex, list);
  }

  const now = new Date().toISOString();
  const out = new Map<string, RetentionExchangeStats>();

  for (const exchange of FREEDOMBOT_RETENTION_EXCHANGES) {
    const days = daysByExchange.get(exchange) ?? [];
    if (days.length < RETENTION_MIN_SAMPLE_SIZE) {
      out.set(exchange, {
        ...buildFallbackExchangeStats(exchange),
        computedAt: now,
      });
      continue;
    }

    const sorted = [...days].sort((a, b) => a - b);
    const p90Raw = percentile(sorted, 0.9);
    const medianRaw = percentile(sorted, 0.5);

    out.set(exchange, {
      exchange,
      p90DaysToSustainedProfit: Math.max(1, Math.round(p90Raw)),
      sampleSize: days.length,
      medianDays: Math.round(medianRaw),
      computedAt: now,
      source: "computed",
    });
  }

  return out;
}

export async function scanClosedProductionTrades(
  db: Firestore,
  allowedPairs: Set<string>,
): Promise<ClosedTradeRow[]> {
  const rows: ClosedTradeRow[] = [];
  let lastDoc: QueryDocumentSnapshot | null = null;
  const PAGE = 400;

  while (true) {
    let q: Query = db
      .collection("live_trades")
      .orderBy("openedAt", "asc")
      .limit(PAGE);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    for (const doc of snap.docs) {
      const t = doc.data() as ClosedTradeRow;
      if (!isProductionTrade(t.testnet) || !isClosedTrade(t.status)) continue;
      const uid = String(t.userId ?? "");
      const exchange = String(t.exchange ?? "").toUpperCase();
      if (!uid || !exchange) continue;
      if (!allowedPairs.has(`${uid}::${exchange}`)) continue;
      rows.push(t);
    }

    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return rows;
}

export async function loadAllowedCryptoDeploymentPairs(
  db: Firestore,
): Promise<Set<string>> {
  const snap = await db.collection("bot_deployments").get();
  const pairs = new Set<string>();
  for (const doc of snap.docs) {
    const x = doc.data();
    const bot = String(x.bot ?? "").toUpperCase();
    if (bot !== "CRYPTO") continue;
    const uid = String(x.uid ?? "");
    const exchange = String(x.exchange ?? "").toUpperCase();
    if (!uid || !exchange) continue;
    if (
      !FREEDOMBOT_RETENTION_EXCHANGES.includes(
        exchange as FreedombotRetentionExchange,
      )
    ) {
      continue;
    }
    pairs.add(`${uid}::${exchange}`);
  }
  return pairs;
}

export async function writeRetentionStats(
  db: Firestore,
  statsByExchange: Map<string, RetentionExchangeStats>,
): Promise<void> {
  const batch = db.batch();
  for (const stats of statsByExchange.values()) {
    batch.set(retentionDocRef(db, stats.exchange), stats, { merge: true });
  }
  await batch.commit();
}

export function normalizeRetentionDoc(
  exchange: string,
  raw: Record<string, unknown> | undefined,
): RetentionExchangeStats {
  if (!raw) return buildFallbackExchangeStats(exchange);

  const p90 =
    typeof raw.p90DaysToSustainedProfit === "number" &&
    Number.isFinite(raw.p90DaysToSustainedProfit)
      ? Math.max(1, Math.round(raw.p90DaysToSustainedProfit))
      : RETENTION_FALLBACK_P90_DAYS;

  const sampleSize =
    typeof raw.sampleSize === "number" && Number.isFinite(raw.sampleSize)
      ? Math.max(0, Math.floor(raw.sampleSize))
      : 0;

  const source: RetentionStatsSource =
    raw.source === "computed" && sampleSize >= RETENTION_MIN_SAMPLE_SIZE
      ? "computed"
      : "fallback";

  const medianDays =
    typeof raw.medianDays === "number" && Number.isFinite(raw.medianDays)
      ? Math.round(raw.medianDays)
      : null;

  return {
    exchange: String(raw.exchange ?? exchange).toUpperCase(),
    p90DaysToSustainedProfit:
      source === "computed" ? p90 : RETENTION_FALLBACK_P90_DAYS,
    sampleSize,
    medianDays,
    computedAt:
      typeof raw.computedAt === "string" ? raw.computedAt : new Date().toISOString(),
    source,
  };
}

export async function readRetentionStatsForExchange(
  db: Firestore,
  exchange: string,
): Promise<RetentionExchangeStats> {
  const ex = String(exchange).toUpperCase();
  try {
    const snap = await retentionDocRef(db, ex).get();
    if (!snap.exists) return buildFallbackExchangeStats(ex);
    return normalizeRetentionDoc(ex, snap.data() as Record<string, unknown>);
  } catch {
    return buildFallbackExchangeStats(ex);
  }
}

/**
 * Full offline recompute: deployments scope → live_trades scan → write config.
 */
export async function recomputeAllRetentionStats(db: Firestore): Promise<{
  statsByExchange: Map<string, RetentionExchangeStats>;
  pairCount: number;
  tradeCount: number;
}> {
  const allowedPairs = await loadAllowedCryptoDeploymentPairs(db);
  const tradeRows = await scanClosedProductionTrades(db, allowedPairs);
  const statsByExchange = computeRetentionStatsByExchange(tradeRows, allowedPairs);
  await writeRetentionStats(db, statsByExchange);
  return {
    statsByExchange,
    pairCount: allowedPairs.size,
    tradeCount: tradeRows.length,
  };
}
