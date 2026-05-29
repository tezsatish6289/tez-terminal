/**
 * Admin Bot Users — platform headline metrics (lifetime scope for now).
 *
 * Query shape reserves `period` / `from` / `to` for future time filters; only
 * `lifetime` is applied today.
 */

import type { Firestore } from "firebase-admin/firestore";
import { bestRealizedPnl } from "./compute-best-pnl";
import { tradeMatchesDeployBot } from "./trade-bot-match";
import { convertToUsdt, getUsdtRates, type UsdtRatesSnapshot } from "./usdt-conversion";

export type PlatformSummaryPeriod = "lifetime";

export const PLATFORM_EXCHANGES = ["BYBIT", "COINDCX", "HYPERLIQUID"] as const;
export type PlatformExchange = (typeof PLATFORM_EXCHANGES)[number];

/** Min consecutive active days for the "active awaiting 30d+" admin segment. */
export const ACTIVE_AWAITING_MIN_DAYS = 30;
/** First-bot age below this → "new account" in PnL (not yet in long-term awaiting). */
export const NEW_ACCOUNT_MAX_DAYS = 30;

export interface PlatformSummaryParams {
  bot: string | null;
  period?: PlatformSummaryPeriod;
  /** Reserved — not applied yet. */
  from?: string | null;
  to?: string | null;
}

export interface AccountRow {
  userId: string;
  email: string | null;
  displayName: string | null;
}

export interface ExchangeSegmentMetrics {
  exchange: string;
  usersWithDeployment: number;
  activeDeployments: number;
  pausedDeployments: number;
  stoppedDeployments: number;
  capitalUsdt: number;
  profitableUsers: number;
  awaitingUsers: number;
}

export interface PlatformSummaryMetrics {
  /** All Firestore user accounts. */
  totalUsers: number;
  /** Lifecycle — mutually exclusive. */
  neverDeployed: number;
  churned: number;
  hasBotNow: number;
  /** Activity — can overlap (users with ≥1 bot in scope). */
  activeUsers: number;
  pausedUsers: number;
  stoppedUsers: number;
  /** PnL — ever-deployed users in bot scope. */
  everDeployedInPnl: number;
  profitableUsers: number;
  /** First bot &lt;30d ago · not profitable. */
  newAccountUsers: number;
  /** First bot ≥30d ago · net PnL &lt; 0. */
  awaitingProfitsUsers: number;
  noClosedTradesUsers: number;
  /** Activity × PnL cross. */
  activeProfitable: number;
  activeAwaiting: number;
  /** Active bot >30 consecutive days · net PnL < 0 */
  activeAwaitingOver30Days: number;
  pausedProfitable: number;
  pausedAwaiting: number;
  /** Platform economics. */
  totalCapitalUsdt: number;
  totalVolumeUsdt: number;
  totalProfitUsdt: number;
  totalDeployments: number;
  activeDeployments: number;
  /** @deprecated use hasBotNow */
  deployedUsers: number;
  /** @deprecated use neverDeployed + churned */
  accountsNoBot: number;
  /** Users with bots but none active. */
  accountsStoppedOnly: number;
  exchanges: ExchangeSegmentMetrics[];
}

export interface ExchangeSegmentDrilldown {
  userIds: string[];
  capitalUserIds: string[];
  profitableUserIds: string[];
  awaitingUserIds: string[];
}

export interface PlatformSegments {
  neverDeployed: AccountRow[];
  churned: AccountRow[];
  hasBotNow: AccountRow[];
  activeUsers: string[];
  pausedUsers: string[];
  stoppedUsers: string[];
  profitableUsers: string[];
  newAccountUsers: string[];
  awaitingProfitsUsers: string[];
  noClosedTradesUsers: string[];
  activeProfitable: string[];
  activeAwaiting: string[];
  activeAwaitingOver30Days: string[];
  pausedProfitable: string[];
  pausedAwaiting: string[];
  exchanges: Record<string, ExchangeSegmentDrilldown>;
}

export interface UserBotScopeEntry {
  hasDeployment: boolean;
  hasActive: boolean;
  hasPaused: boolean;
  hasStopped: boolean;
  deploymentIds: string[];
  exchanges: string[];
}

export interface PlatformSummaryResult {
  period: PlatformSummaryPeriod;
  bot: string | null;
  rates: UsdtRatesSnapshot;
  metrics: PlatformSummaryMetrics;
  segments: PlatformSegments;
  /** Drill-down: Firebase uids with ≥1 deployment in bot scope. */
  userIdsAll: string[];
  userIdsActive: string[];
  userIdsStoppedOnly: string[];
  accountsNoBot: AccountRow[];
  userBotScope: Record<string, UserBotScopeEntry>;
  pairTotals: Record<
    string,
    { profitNative: number; profitCurrency: string; volumeNative: number }
  >;
}

type DepRow = {
  id: string;
  uid: string;
  bot: string;
  exchange: string;
  status: string;
  createdAt: string | null;
  resumedAt: string | null;
  walletTotal?: number;
  walletCurrency?: string;
  walletStatus?: string;
  lifetimeRealizedPnl?: number;
  closedTradeCount?: number;
};

type UserDocRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  freedombotFirstBot?: { bot?: string; deployedAt?: string } | null;
};

function pairKey(uid: string, exchange: string): string {
  return `${uid}::${String(exchange).toUpperCase()}`;
}

function isProductionTrade(testnet: unknown): boolean {
  return testnet !== true;
}

function isClosedTrade(status: unknown): boolean {
  return String(status ?? "").toUpperCase() === "CLOSED";
}

function isActiveDeployment(status: string): boolean {
  return String(status).toLowerCase() === "active";
}

function isPausedDeployment(status: string): boolean {
  return String(status).toLowerCase() === "paused";
}

function isStoppedDeployment(status: string): boolean {
  return String(status).toLowerCase() === "stopped";
}

function matchesBotFilter(bot: string, filter: string | null): boolean {
  if (!filter) return true;
  return bot === filter;
}

function roundUsdt(n: number): number {
  return Math.round(n * 100) / 100;
}

function firestoreIso(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  const ts = raw as { toDate?: () => Date };
  if (typeof ts?.toDate === "function") return ts.toDate().toISOString();
  return null;
}

/** Calendar days since the deployment entered its current active stretch. */
export function consecutiveActiveDays(activeSinceIso: string | null): number {
  if (!activeSinceIso) return 0;
  const ms = Date.now() - new Date(activeSinceIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function maxConsecutiveActiveDays(activeDeps: DepRow[]): number {
  let max = 0;
  for (const dep of activeDeps) {
    const since = dep.resumedAt ?? dep.createdAt;
    max = Math.max(max, consecutiveActiveDays(since));
  }
  return max;
}

function userHasActiveOverDays(
  uid: string,
  scopedDeps: DepRow[],
  minDays: number,
  exchange?: string,
): boolean {
  const activeDeps = scopedDeps.filter(
    (d) =>
      d.uid === uid &&
      isActiveDeployment(d.status) &&
      (!exchange || d.exchange === exchange),
  );
  return maxConsecutiveActiveDays(activeDeps) > minDays;
}

function daysSinceIso(iso: string | null): number {
  return consecutiveActiveDays(iso);
}

/** Calendar days since the user's first bot deploy in scope. */
function daysSinceFirstDeploy(
  u: UserDocRow,
  uid: string,
  scopedDeps: DepRow[],
  botFilter: string | null,
): number | null {
  let earliest: string | null = null;
  for (const d of scopedDeps) {
    if (d.uid !== uid || !d.createdAt) continue;
    if (!earliest || d.createdAt < earliest) earliest = d.createdAt;
  }
  const first = u.freedombotFirstBot;
  if (first?.deployedAt) {
    if (!botFilter || String(first.bot ?? "").toUpperCase() === botFilter) {
      if (!earliest || first.deployedAt < earliest) earliest = first.deployedAt;
    }
  }
  if (!earliest) return null;
  return daysSinceIso(earliest);
}

function accountFromUser(u: UserDocRow): AccountRow {
  return { userId: u.uid, email: u.email, displayName: u.displayName };
}

function everDeployedInScope(
  u: UserDocRow,
  hasDeployment: boolean,
  hasClosedTrades: boolean,
  botFilter: string | null,
): boolean {
  if (hasDeployment || hasClosedTrades) return true;
  const first = u.freedombotFirstBot;
  if (!first?.bot) return false;
  if (!botFilter) return true;
  return String(first.bot).toUpperCase() === botFilter;
}

interface TradeScanResult {
  pairProfit: Map<string, { amount: number; currency: string }>;
  pairVolume: Map<string, number>;
  userNetPnlUsdt: Map<string, number>;
  userExchangePnlUsdt: Map<string, number>;
  usersWithClosedTrades: Set<string>;
}

/**
 * Walk closed production trades; bucket by uid+exchange and per-user net PnL.
 */
async function scanClosedTrades(
  db: Firestore,
  botFilter: string | null,
  rates: UsdtRatesSnapshot,
): Promise<TradeScanResult> {
  const pairProfit = new Map<string, { amount: number; currency: string }>();
  const pairVolume = new Map<string, number>();
  const userNetPnlUsdt = new Map<string, number>();
  const userExchangePnlUsdt = new Map<string, number>();
  const usersWithClosedTrades = new Set<string>();

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const PAGE = 400;

  while (true) {
    let q: FirebaseFirestore.Query = db
      .collection("live_trades")
      .orderBy("openedAt", "asc")
      .limit(PAGE);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    for (const doc of snap.docs) {
      const t = doc.data();
      if (!isProductionTrade(t.testnet) || !isClosedTrade(t.status)) continue;

      const uid = String(t.userId ?? "");
      const exchange = String(t.exchange ?? "").toUpperCase();
      if (!uid || !exchange) continue;

      if (botFilter && !tradeMatchesDeployBot(t, botFilter)) continue;

      usersWithClosedTrades.add(uid);

      const size = typeof t.positionSize === "number" ? t.positionSize : 0;
      const key = pairKey(uid, exchange);
      if (size > 0) {
        pairVolume.set(key, (pairVolume.get(key) ?? 0) + size);
      }

      const best = bestRealizedPnl(t);
      if (best) {
        const cur = pairProfit.get(key);
        if (!cur) {
          pairProfit.set(key, { amount: best.value, currency: "USDT" });
        } else {
          cur.amount += best.value;
        }

        const pnlUsdt = convertToUsdt(best.value, "USDT", rates);
        userNetPnlUsdt.set(uid, (userNetPnlUsdt.get(uid) ?? 0) + pnlUsdt);
        userExchangePnlUsdt.set(
          key,
          (userExchangePnlUsdt.get(key) ?? 0) + pnlUsdt,
        );
      }
    }

    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return {
    pairProfit,
    pairVolume,
    userNetPnlUsdt,
    userExchangePnlUsdt,
    usersWithClosedTrades,
  };
}

function seedProfitFromDeployments(
  scopedDeps: DepRow[],
  pairProfit: Map<string, { amount: number; currency: string }>,
  userNetPnlUsdt: Map<string, number>,
  userExchangePnlUsdt: Map<string, number>,
  rates: UsdtRatesSnapshot,
): void {
  for (const dep of scopedDeps) {
    if (typeof dep.lifetimeRealizedPnl !== "number") continue;
    const key = pairKey(dep.uid, dep.exchange);
    if (!pairProfit.has(key)) {
      const currency = dep.walletCurrency?.toUpperCase() === "INR" ? "INR" : "USDT";
      pairProfit.set(key, { amount: dep.lifetimeRealizedPnl, currency });
      const pnlUsdt = convertToUsdt(dep.lifetimeRealizedPnl, currency, rates);
      userNetPnlUsdt.set(
        dep.uid,
        (userNetPnlUsdt.get(dep.uid) ?? 0) + pnlUsdt,
      );
      userExchangePnlUsdt.set(
        key,
        (userExchangePnlUsdt.get(key) ?? 0) + pnlUsdt,
      );
    }
  }
}

function sumCapitalForDeps(
  deps: DepRow[],
  rates: UsdtRatesSnapshot,
  exchangeFilter?: string,
): number {
  const seenWallet = new Set<string>();
  let total = 0;
  for (const dep of deps) {
    if (!isActiveDeployment(dep.status)) continue;
    if (exchangeFilter && dep.exchange !== exchangeFilter) continue;
    if (String(dep.walletStatus).toLowerCase() !== "valid" || dep.walletTotal == null) {
      continue;
    }
    const walletKey = pairKey(dep.uid, dep.exchange);
    if (seenWallet.has(walletKey)) continue;
    seenWallet.add(walletKey);
    total += convertToUsdt(dep.walletTotal, dep.walletCurrency ?? "USDT", rates);
  }
  return total;
}

export async function computePlatformSummary(
  db: Firestore,
  params: PlatformSummaryParams,
): Promise<PlatformSummaryResult> {
  const period: PlatformSummaryPeriod = params.period ?? "lifetime";
  const botFilter = params.bot?.trim().toUpperCase() || null;
  const rates = await getUsdtRates();

  const [depSnap, usersSnap] = await Promise.all([
    db.collection("bot_deployments").get(),
    db.collection("users").get(),
  ]);

  const allUsers: UserDocRow[] = usersSnap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      email: (u.email as string) ?? null,
      displayName: (u.displayName as string) ?? null,
      freedombotFirstBot: (u.freedombotFirstBot as UserDocRow["freedombotFirstBot"]) ?? null,
    };
  });

  const allDeps: DepRow[] = depSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      uid: String(x.uid ?? ""),
      bot: String(x.bot ?? ""),
      exchange: String(x.exchange ?? "").toUpperCase(),
      status: String(x.status ?? ""),
      createdAt: firestoreIso(x.createdAt),
      resumedAt: typeof x.resumedAt === "string" ? x.resumedAt : null,
      walletTotal: typeof x.walletTotal === "number" ? x.walletTotal : undefined,
      walletCurrency: typeof x.walletCurrency === "string" ? x.walletCurrency : undefined,
      walletStatus: typeof x.walletStatus === "string" ? x.walletStatus : undefined,
      lifetimeRealizedPnl: typeof x.lifetimeRealizedPnl === "number" ? x.lifetimeRealizedPnl : undefined,
      closedTradeCount: typeof x.closedTradeCount === "number" ? x.closedTradeCount : undefined,
    };
  });

  const scopedDeps = allDeps.filter((d) => d.uid && matchesBotFilter(d.bot, botFilter));

  const userBotScope: PlatformSummaryResult["userBotScope"] = {};
  for (const dep of scopedDeps) {
    const entry = userBotScope[dep.uid] ?? {
      hasDeployment: true,
      hasActive: false,
      hasPaused: false,
      hasStopped: false,
      deploymentIds: [],
      exchanges: [],
    };
    entry.deploymentIds.push(dep.id);
    if (isActiveDeployment(dep.status)) entry.hasActive = true;
    if (isPausedDeployment(dep.status)) entry.hasPaused = true;
    if (isStoppedDeployment(dep.status)) entry.hasStopped = true;
    if (!entry.exchanges.includes(dep.exchange)) entry.exchanges.push(dep.exchange);
    userBotScope[dep.uid] = entry;
  }

  let tradeScan: TradeScanResult;
  try {
    tradeScan = await scanClosedTrades(db, botFilter, rates);
  } catch (e) {
    console.error(
      "[PlatformSummary] live_trades scan failed, using deployment PnL cache:",
      e instanceof Error ? e.message : e,
    );
    tradeScan = {
      pairProfit: new Map(),
      pairVolume: new Map(),
      userNetPnlUsdt: new Map(),
      userExchangePnlUsdt: new Map(),
      usersWithClosedTrades: new Set(),
    };
    seedProfitFromDeployments(
      scopedDeps,
      tradeScan.pairProfit,
      tradeScan.userNetPnlUsdt,
      tradeScan.userExchangePnlUsdt,
      rates,
    );
    for (const uid of tradeScan.userNetPnlUsdt.keys()) {
      tradeScan.usersWithClosedTrades.add(uid);
    }
  }

  const { pairProfit, pairVolume, userNetPnlUsdt, userExchangePnlUsdt, usersWithClosedTrades } =
    tradeScan;

  const allowedPairs = new Set(scopedDeps.map((d) => pairKey(d.uid, d.exchange)));

  const pairTotals: PlatformSummaryResult["pairTotals"] = {};
  let totalVolumeUsdt = 0;
  let totalProfitUsdt = 0;

  for (const key of allowedPairs) {
    const vol = pairVolume.get(key) ?? 0;
    const profit = pairProfit.get(key)?.amount ?? 0;
    const currency = pairProfit.get(key)?.currency ?? "USDT";
    pairTotals[key] = {
      profitNative: profit,
      profitCurrency: currency,
      volumeNative: vol,
    };
    totalVolumeUsdt += convertToUsdt(vol, "USDT", rates);
    totalProfitUsdt += convertToUsdt(profit, currency, rates);
  }

  const totalCapitalUsdt = sumCapitalForDeps(scopedDeps, rates);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  const neverDeployed: AccountRow[] = [];
  const churned: AccountRow[] = [];
  const hasBotNow: AccountRow[] = [];

  for (const u of allUsers) {
    const scope = userBotScope[u.uid];
    const hasDeployment = scope?.hasDeployment ?? false;
    const hasClosedTrades = usersWithClosedTrades.has(u.uid);
    const ever = everDeployedInScope(u, hasDeployment, hasClosedTrades, botFilter);

    if (hasDeployment) {
      hasBotNow.push(accountFromUser(u));
    } else if (ever) {
      churned.push(accountFromUser(u));
    } else {
      neverDeployed.push(accountFromUser(u));
    }
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  const activeUsers: string[] = [];
  const pausedUsers: string[] = [];
  const stoppedUsers: string[] = [];

  for (const [uid, scope] of Object.entries(userBotScope)) {
    if (scope.hasActive) activeUsers.push(uid);
    if (scope.hasPaused) pausedUsers.push(uid);
    if (scope.hasStopped) stoppedUsers.push(uid);
  }

  const activeSet = new Set(activeUsers);
  const pausedSet = new Set(pausedUsers);

  // ── PnL ───────────────────────────────────────────────────────────────────
  const profitableUsers: string[] = [];
  const newAccountUsers: string[] = [];
  const awaitingProfitsUsers: string[] = [];
  const noClosedTradesUsers: string[] = [];
  let everDeployedInPnl = 0;

  for (const u of allUsers) {
    const hasDeployment = userBotScope[u.uid]?.hasDeployment ?? false;
    const hasClosedTrades = usersWithClosedTrades.has(u.uid);
    const ever = everDeployedInScope(u, hasDeployment, hasClosedTrades, botFilter);
    if (!ever) continue;

    everDeployedInPnl++;
    const net = userNetPnlUsdt.get(u.uid) ?? 0;
    const daysSinceDeploy = daysSinceFirstDeploy(u, u.uid, scopedDeps, botFilter);

    if (net > 0) {
      profitableUsers.push(u.uid);
      continue;
    }

    if (daysSinceDeploy != null && daysSinceDeploy < NEW_ACCOUNT_MAX_DAYS) {
      newAccountUsers.push(u.uid);
      continue;
    }

    if (net < 0 && daysSinceDeploy != null && daysSinceDeploy >= NEW_ACCOUNT_MAX_DAYS) {
      awaitingProfitsUsers.push(u.uid);
      continue;
    }

    if (!hasClosedTrades) {
      noClosedTradesUsers.push(u.uid);
    }
  }

  const profitableSet = new Set(profitableUsers);
  const awaitingSet = new Set(awaitingProfitsUsers);

  const activeProfitable = activeUsers.filter((uid) => profitableSet.has(uid));
  const activeAwaiting = activeUsers.filter((uid) => !profitableSet.has(uid));
  const activeAwaitingOver30Days = activeAwaiting.filter((uid) =>
    awaitingSet.has(uid) && userHasActiveOverDays(uid, scopedDeps, ACTIVE_AWAITING_MIN_DAYS),
  );
  const pausedProfitable = pausedUsers.filter((uid) => profitableSet.has(uid));
  const pausedAwaiting = pausedUsers.filter((uid) => {
    if (profitableSet.has(uid)) return false;
    const user = allUsers.find((u) => u.uid === uid);
    if (!user) return false;
    const days = daysSinceFirstDeploy(user, uid, scopedDeps, botFilter);
    return days != null && days < NEW_ACCOUNT_MAX_DAYS;
  });

  // ── Exchange breakdown ────────────────────────────────────────────────────
  const exchangeDrilldown: Record<string, ExchangeSegmentDrilldown> = {};
  const exchangeMetrics: ExchangeSegmentMetrics[] = [];

  for (const exchange of PLATFORM_EXCHANGES) {
    const exchangeDeps = scopedDeps.filter((d) => d.exchange === exchange);
    const userIds = [...new Set(exchangeDeps.map((d) => d.uid))];

    const capitalUserIds: string[] = [];
    const seenCapital = new Set<string>();
    for (const dep of exchangeDeps) {
      if (!isActiveDeployment(dep.status)) continue;
      if (String(dep.walletStatus).toLowerCase() !== "valid" || dep.walletTotal == null) continue;
      const walletKey = pairKey(dep.uid, dep.exchange);
      if (seenCapital.has(walletKey)) continue;
      seenCapital.add(walletKey);
      capitalUserIds.push(dep.uid);
    }

    const profitableUserIds: string[] = [];
    const awaitingUserIds: string[] = [];
    for (const uid of userIds) {
      const exPnl = userExchangePnlUsdt.get(pairKey(uid, exchange)) ?? 0;
      if (exPnl > 0) {
        profitableUserIds.push(uid);
      } else if (
        exPnl < 0 &&
        userHasActiveOverDays(uid, scopedDeps, ACTIVE_AWAITING_MIN_DAYS, exchange)
      ) {
        awaitingUserIds.push(uid);
      }
    }

    exchangeDrilldown[exchange] = {
      userIds,
      capitalUserIds,
      profitableUserIds,
      awaitingUserIds,
    };

    exchangeMetrics.push({
      exchange,
      usersWithDeployment: userIds.length,
      activeDeployments: exchangeDeps.filter((d) => isActiveDeployment(d.status)).length,
      pausedDeployments: exchangeDeps.filter((d) => isPausedDeployment(d.status)).length,
      stoppedDeployments: exchangeDeps.filter((d) => isStoppedDeployment(d.status)).length,
      capitalUsdt: roundUsdt(sumCapitalForDeps(scopedDeps, rates, exchange)),
      profitableUsers: profitableUserIds.length,
      awaitingUsers: awaitingUserIds.length,
    });
  }

  const userIdsAll = Object.keys(userBotScope);
  const userIdsActive = activeUsers;
  const userIdsStoppedOnly = userIdsAll.filter((uid) => !activeSet.has(uid));
  const accountsNoBot = [...neverDeployed, ...churned];
  const activeDeployments = scopedDeps.filter((d) => isActiveDeployment(d.status)).length;

  const segments: PlatformSegments = {
    neverDeployed,
    churned,
    hasBotNow,
    activeUsers,
    pausedUsers,
    stoppedUsers,
    profitableUsers,
    newAccountUsers,
    awaitingProfitsUsers,
    noClosedTradesUsers,
    activeProfitable,
    activeAwaiting,
    activeAwaitingOver30Days,
    pausedProfitable,
    pausedAwaiting,
    exchanges: exchangeDrilldown,
  };

  return {
    period,
    bot: botFilter,
    rates,
    metrics: {
      totalUsers: allUsers.length,
      neverDeployed: neverDeployed.length,
      churned: churned.length,
      hasBotNow: hasBotNow.length,
      activeUsers: activeUsers.length,
      pausedUsers: pausedUsers.length,
      stoppedUsers: stoppedUsers.length,
      everDeployedInPnl,
      profitableUsers: profitableUsers.length,
      newAccountUsers: newAccountUsers.length,
      awaitingProfitsUsers: awaitingProfitsUsers.length,
      noClosedTradesUsers: noClosedTradesUsers.length,
      activeProfitable: activeProfitable.length,
      activeAwaiting: activeAwaiting.length,
      activeAwaitingOver30Days: activeAwaitingOver30Days.length,
      pausedProfitable: pausedProfitable.length,
      pausedAwaiting: pausedAwaiting.length,
      totalCapitalUsdt: roundUsdt(totalCapitalUsdt),
      totalVolumeUsdt: roundUsdt(totalVolumeUsdt),
      totalProfitUsdt: roundUsdt(totalProfitUsdt),
      totalDeployments: scopedDeps.length,
      activeDeployments,
      deployedUsers: hasBotNow.length,
      accountsNoBot: accountsNoBot.length,
      accountsStoppedOnly: userIdsStoppedOnly.length,
      exchanges: exchangeMetrics,
    },
    segments,
    userIdsAll,
    userIdsActive,
    userIdsStoppedOnly,
    accountsNoBot,
    userBotScope,
    pairTotals,
  };
}
