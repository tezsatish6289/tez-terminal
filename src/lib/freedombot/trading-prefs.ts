import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import {
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";
import {
  DEFAULT_TRADING_PREFS,
  DAILY_LOSS_OPTIONS,
  LEGACY_DEFAULT_DAILY_LOSS_LIMIT,
  LEGACY_DEFAULT_RISK_PER_TRADE,
  MAX_CONCURRENT_OPTIONS,
  RISK_PER_TRADE_OPTIONS,
  resolveDailyLossLimit,
  resolveRiskPerTrade,
  secretNeedsTradingDefaultsMigration,
  type TradingPrefs,
} from "@/lib/freedombot/trading-prefs-shared";

export {
  DEFAULT_TRADING_PREFS,
  DAILY_LOSS_OPTIONS,
  LEGACY_DEFAULT_DAILY_LOSS_LIMIT,
  LEGACY_DEFAULT_RISK_PER_TRADE,
  MAX_CONCURRENT_OPTIONS,
  RISK_PER_TRADE_OPTIONS,
  resolveDailyLossLimit,
  resolveRiskPerTrade,
  secretNeedsTradingDefaultsMigration,
  type TradingPrefs,
};

function isRiskPerTrade(n: number): n is (typeof RISK_PER_TRADE_OPTIONS)[number] {
  return (RISK_PER_TRADE_OPTIONS as readonly number[]).includes(n);
}

function isMaxConcurrent(n: number): n is (typeof MAX_CONCURRENT_OPTIONS)[number] {
  return (MAX_CONCURRENT_OPTIONS as readonly number[]).includes(n);
}

function isDailyLoss(n: number): n is (typeof DAILY_LOSS_OPTIONS)[number] {
  return (DAILY_LOSS_OPTIONS as readonly number[]).includes(n);
}

export function tradingPrefsFromSecret(
  data: Record<string, unknown> | undefined | null,
): TradingPrefs {
  if (!data) return { ...DEFAULT_TRADING_PREFS };
  const max =
    typeof data.maxConcurrentTrades === "number" &&
    isMaxConcurrent(data.maxConcurrentTrades)
      ? data.maxConcurrentTrades
      : DEFAULT_TRADING_PREFS.maxConcurrentTrades;
  return {
    riskPerTrade: resolveRiskPerTrade(data.riskPerTrade),
    maxConcurrentTrades: max,
    dailyLossLimit: resolveDailyLossLimit(data.dailyLossLimit),
  };
}

export function validateTradingPrefsUpdate(body: {
  riskPerTrade?: unknown;
  maxConcurrentTrades?: unknown;
  dailyLossLimit?: unknown;
}): { ok: true; updates: Partial<TradingPrefs> } | { ok: false; error: string } {
  const updates: Partial<TradingPrefs> = {};

  if (body.riskPerTrade !== undefined) {
    const n = Number(body.riskPerTrade);
    if (!Number.isFinite(n) || !isRiskPerTrade(n)) {
      return { ok: false, error: "riskPerTrade must be 0.25, 0.5, 0.75, or 1" };
    }
    updates.riskPerTrade = n;
  }

  if (body.maxConcurrentTrades !== undefined) {
    const n = Number(body.maxConcurrentTrades);
    if (!Number.isInteger(n) || !isMaxConcurrent(n)) {
      return { ok: false, error: "maxConcurrentTrades must be 1, 2, 3, or 5" };
    }
    updates.maxConcurrentTrades = n;
  }

  if (body.dailyLossLimit !== undefined) {
    const n = Number(body.dailyLossLimit);
    if (!Number.isFinite(n) || !isDailyLoss(n)) {
      return { ok: false, error: "dailyLossLimit must be 2, 3, 5, or 10" };
    }
    updates.dailyLossLimit = n;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "No valid fields to update" };
  }

  return { ok: true, updates };
}

export async function findSecretRefForExchange(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<DocumentReference | null> {
  const exchangeName = exchange.toUpperCase() as ExchangeName;
  const docIds = getSecretDocIds(exchangeName);

  for (const id of docIds) {
    const docRef = db.collection("users").doc(uid).collection("secrets").doc(id);
    const doc = await docRef.get();
    if (doc.exists && docMatchesExchange(doc.data()!, exchangeName, id)) {
      return docRef;
    }
  }

  return null;
}

export async function loadTradingPrefs(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<TradingPrefs> {
  const ref = await findSecretRefForExchange(db, uid, exchange);
  if (!ref) return { ...DEFAULT_TRADING_PREFS };
  const doc = await ref.get();
  return tradingPrefsFromSecret(doc.data() as Record<string, unknown> | undefined);
}
