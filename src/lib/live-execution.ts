import { executeTrade as executeExchangeTrade, type Credentials } from "./trade-engine";
import { decrypt } from "./crypto";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  getSecretDocIds,
  docMatchesExchange,
} from "./exchanges";
import type { SimTrade } from "./simulator";

/**
 * Execute a trade for ALL users who have autoTradeEnabled on any supported exchange.
 * Each user is executed independently via Promise.allSettled.
 *
 * Shared across:
 *   - webhook/route.ts  (immediate signal → live)
 *   - sync-simulator/route.ts  (incubated signal → live)
 */
export async function executeForAllUsers(
  db: FirebaseFirestore.Firestore,
  simTrade: SimTrade,
  simTradeId: string,
  simulatorCapital: number,
  signalId: string,
  symbol: string,
  signalType: string,
  signalExchange: string,
) {
  const usersSnap = await db.collection("users").get();

  interface UserExecutionTask {
    userId: string;
    exchange: ExchangeName;
    creds: Credentials;
  }

  const tasks: UserExecutionTask[] = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;

    for (const exchangeName of SUPPORTED_EXCHANGES) {
      const docIds = getSecretDocIds(exchangeName);

      for (const id of docIds) {
        try {
          const secretDoc = await db.collection("users").doc(userId)
            .collection("secrets").doc(id).get();

          if (secretDoc.exists) {
            const data = secretDoc.data()!;
            if (!docMatchesExchange(data, exchangeName)) continue;
            if (data.autoTradeEnabled === true) {
              tasks.push({
                userId,
                exchange: exchangeName,
                creds: {
                  apiKey: decrypt(data.encryptedKey),
                  apiSecret: decrypt(data.encryptedSecret),
                  testnet: data.useTestnet === true,
                },
              });
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  if (tasks.length === 0) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "SKIPPED",
      details: `${symbol} ${signalType} — no users with auto-trade enabled on any exchange. (${usersSnap.size} users scanned)`,
      signalId,
      symbol,
    });
    return;
  }

  await db.collection("live_trade_logs").add({
    timestamp: new Date().toISOString(),
    action: "EVALUATING",
    details: `${symbol} ${signalType} — found ${tasks.length} qualifying user(s) across exchanges: ${[...new Set(tasks.map(t => t.exchange))].join(", ")}`,
    signalId,
    symbol,
  });

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      await db.collection("live_trade_logs").add({
        timestamp: new Date().toISOString(),
        action: "EVALUATING",
        details: `${symbol} ${signalType} — attempting ${task.exchange} execution for user ${task.userId} (score=${simTrade.confidenceScore}, bias=${simTrade.biasAtEntry})`,
        signalId,
        symbol,
        userId: task.userId,
        exchange: task.exchange,
      });

      const liveResult = await executeExchangeTrade(
        simTrade,
        task.userId,
        simTradeId,
        simulatorCapital,
        task.creds,
        task.exchange,
      );

      if (liveResult.success && liveResult.trade) {
        await db.collection("live_trades").add(liveResult.trade);
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "TRADE_OPENED",
          details: `${symbol} ${signalType} executed on ${task.exchange} @ $${liveResult.trade.entryPrice} qty=${liveResult.trade.quantity} size=$${liveResult.trade.positionSize.toFixed(2)} lev=${liveResult.trade.leverage}x${liveResult.warnings.length ? ` ⚠ ${liveResult.warnings.join("; ")}` : ""}`,
          signalId,
          symbol,
          userId: task.userId,
          exchange: task.exchange,
        });
      } else {
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "TRADE_FAILED",
          details: `${symbol} ${signalType} ${task.exchange} execution failed for user ${task.userId}: ${liveResult.error}`,
          signalId,
          symbol,
          userId: task.userId,
          exchange: task.exchange,
        });
      }

      return liveResult;
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (tasks.length > 1 || failed > 0) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "MULTI_USER_SUMMARY",
      details: `${symbol} ${signalType} — ${succeeded}/${tasks.length} users executed successfully, ${failed} failures`,
      signalId,
      symbol,
    });
  }
}
