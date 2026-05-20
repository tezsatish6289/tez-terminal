/**
 * Admin Bot Users — platform headline metrics (lifetime scope for now).
 *
 * Query shape reserves `period` / `from` / `to` for future time filters; only
 * `lifetime` is applied today.
 */

import type { Firestore } from "firebase-admin/firestore";
import { bestRealizedPnl } from "./compute-best-pnl";
import { convertToUsdt, getUsdtRates, type UsdtRatesSnapshot } from "./usdt-conversion";

export type PlatformSummaryPeriod = "lifetime";

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

export interface PlatformSummaryMetrics {
  /** All accounts in scope: deployed at least once + never deployed. */
  totalUsers: number;
  /** Unique users with ≥1 deployment row in the bot filter. */
  deployedUsers: number;
  activeUsers: number;
  totalCapitalUsdt: number;
  totalVolumeUsdt: number;
  totalProfitUsdt: number;
  accountsNoBot: number;
  accountsStoppedOnly: number;
  totalDeployments: number;
  activeDeployments: number;
}

export interface PlatformSummaryResult {
  period: PlatformSummaryPeriod;
  bot: string | null;
  rates: UsdtRatesSnapshot;
  metrics: PlatformSummaryMetrics;
  /** Drill-down: Firebase uids */
  userIdsAll: string[];
  userIdsActive: string[];
  userIdsStoppedOnly: string[];
  accountsNoBot: AccountRow[];
  /** uid → best deployment status for filtered bot scope */
  userBotScope: Record<
    string,
    { hasDeployment: boolean; hasActive: boolean; deploymentIds: string[] }
  >;
  /** Per (uid, exchange) deduped totals for profit/volume */
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
  walletTotal?: number;
  walletCurrency?: string;
  walletStatus?: string;
  lifetimeRealizedPnl?: number;
  closedTradeCount?: number;
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

function matchesBotFilter(bot: string, filter: string | null): boolean {
  if (!filter) return true;
  return bot === filter;
}

/**
 * Walk closed production trades; bucket volume + profit by uid+exchange.
 * Uses `orderBy(openedAt)` only (indexed) and filters status/testnet in memory so
 * we don't require a status+testnet+openedAt composite index.
 */
async function sumClosedTradeVolumeAndProfit(
  db: Firestore,
  allowedPairs: Set<string>,
  pairProfit: Map<string, { amount: number; currency: string }>,
  pairVolume: Map<string, number>,
): Promise<void> {
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
      const exchange = String(t.exchange ?? "");
      if (!uid || !exchange) continue;
      const key = pairKey(uid, exchange);
      if (!allowedPairs.has(key)) continue;

      const size = typeof t.positionSize === "number" ? t.positionSize : 0;
      if (size > 0) {
        pairVolume.set(key, (pairVolume.get(key) ?? 0) + size);
      }

      const best = bestRealizedPnl(t);
      if (best) {
        const cur = pairProfit.get(key);
        const currency = "USDT";
        if (!cur) {
          pairProfit.set(key, { amount: best.value, currency });
        } else {
          cur.amount += best.value;
        }
      }
    }

    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

/** Fallback when trade scan fails: cached lifetime PnL on deployment docs. */
function seedProfitFromDeployments(
  scopedDeps: DepRow[],
  pairProfit: Map<string, { amount: number; currency: string }>,
): void {
  for (const dep of scopedDeps) {
    if (typeof dep.lifetimeRealizedPnl !== "number") continue;
    const key = pairKey(dep.uid, dep.exchange);
    if (pairProfit.has(key)) continue;
    pairProfit.set(key, {
      amount: dep.lifetimeRealizedPnl,
      currency: dep.walletCurrency?.toUpperCase() === "INR" ? "INR" : "USDT",
    });
  }
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

  const allDeps: DepRow[] = depSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      uid: String(x.uid ?? ""),
      bot: String(x.bot ?? ""),
      exchange: String(x.exchange ?? "").toUpperCase(),
      status: String(x.status ?? ""),
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
      deploymentIds: [],
    };
    entry.deploymentIds.push(dep.id);
    if (isActiveDeployment(dep.status)) entry.hasActive = true;
    userBotScope[dep.uid] = entry;
  }

  const userIdsAll = Object.keys(userBotScope);
  const userIdsActive = userIdsAll.filter((uid) => userBotScope[uid]!.hasActive);
  const userIdsStoppedOnly = userIdsAll.filter((uid) => !userBotScope[uid]!.hasActive);

  const accountsNoBot: AccountRow[] = [];
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const u = userDoc.data();
    const hasScoped = userBotScope[uid]?.hasDeployment ?? false;
    if (hasScoped) continue;
    accountsNoBot.push({
      userId: uid,
      email: (u.email as string) ?? null,
      displayName: (u.displayName as string) ?? null,
    });
  }

  const allowedPairs = new Set(
    scopedDeps.map((d) => pairKey(d.uid, d.exchange)),
  );

  const pairProfit = new Map<string, { amount: number; currency: string }>();
  const pairVolume = new Map<string, number>();

  try {
    await sumClosedTradeVolumeAndProfit(db, allowedPairs, pairProfit, pairVolume);
  } catch (e) {
    console.error(
      "[PlatformSummary] live_trades scan failed, using deployment PnL cache:",
      e instanceof Error ? e.message : e,
    );
    seedProfitFromDeployments(scopedDeps, pairProfit);
  }

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

  let totalCapitalUsdt = 0;
  for (const dep of scopedDeps) {
    if (!isActiveDeployment(dep.status)) continue;
    if (String(dep.walletStatus).toLowerCase() !== "valid" || dep.walletTotal == null) continue;
    totalCapitalUsdt += convertToUsdt(
      dep.walletTotal,
      dep.walletCurrency ?? "USDT",
      rates,
    );
  }

  const activeDeployments = scopedDeps.filter((d) => isActiveDeployment(d.status)).length;
  const deployedUsers = userIdsAll.length;
  const totalAccounts = deployedUsers + accountsNoBot.length;

  return {
    period,
    bot: botFilter,
    rates,
    metrics: {
      totalUsers: totalAccounts,
      deployedUsers,
      activeUsers: userIdsActive.length,
      totalCapitalUsdt: Math.round(totalCapitalUsdt * 100) / 100,
      totalVolumeUsdt: Math.round(totalVolumeUsdt * 100) / 100,
      totalProfitUsdt: Math.round(totalProfitUsdt * 100) / 100,
      accountsNoBot: accountsNoBot.length,
      accountsStoppedOnly: userIdsStoppedOnly.length,
      totalDeployments: scopedDeps.length,
      activeDeployments,
    },
    userIdsAll,
    userIdsActive,
    userIdsStoppedOnly,
    accountsNoBot,
    userBotScope,
    pairTotals,
  };
}
