import { executeTrade as executeExchangeTrade, type Credentials } from "./trade-engine";
import { decrypt, encrypt } from "./crypto";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  STOCK_BROKERS,
  CRYPTO_BROKERS,
  isStockExchange,
  getExchangeSegment,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  type ExchangeCredentials,
} from "./exchanges";
import type { SimTrade, SimConfigType } from "./simulator";
import { isIndianMarketEntryAllowed } from "./market-hours";
import { getDhanLeverage } from "./exchanges/dhan";
import { generateTokenForUser } from "./dhan-token";

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
  simConfig?: SimConfigType,
) {
  const usersSnap = await db.collection("users").get();

  const isStock = isStockExchange(signalExchange);

  // Block new Indian stock entries after 2:30 PM IST
  if (isStock && !isIndianMarketEntryAllowed()) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "SKIPPED",
      details: `${symbol} ${signalType} — past 2:30 PM IST entry cutoff. No new intraday positions opened.`,
      signalId,
      symbol,
    });
    return;
  }

  interface UserExecutionTask {
    userId: string;
    exchange: ExchangeName;
    creds: Credentials;
    effectiveSimTrade: SimTrade;
  }

  const tasks: UserExecutionTask[] = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;

    const brokerList = isStock ? STOCK_BROKERS : CRYPTO_BROKERS;
    for (const brokerName of brokerList) {
      const docIds = getSecretDocIds(brokerName);

      for (const id of docIds) {
        try {
          const secretDoc = await db.collection("users").doc(userId)
            .collection("secrets").doc(id).get();

          if (secretDoc.exists) {
            const data = secretDoc.data()!;
            if (!docMatchesExchange(data, brokerName)) continue;
            if (data.autoTradeEnabled === true) {
              let apiKey: string;
              let apiSecret: string;

              if (brokerName === "DHAN") {
                // TOTP-based: encryptedKey = clientId, encryptedSecret = TOTP secret
                const clientId = decrypt(data.encryptedKey);

                if (data.encryptedPin) {
                  // New TOTP setup — get or generate access token
                  const totpSecret = decrypt(data.encryptedSecret);
                  const pin = decrypt(data.encryptedPin);
                  let accessToken: string | null = null;

                  if (data.encryptedCachedToken && data.cachedTokenExpiresAt) {
                    const expiresAt = new Date(data.cachedTokenExpiresAt as string).getTime();
                    if (Date.now() < expiresAt - 5 * 60 * 1000) {
                      try { accessToken = decrypt(data.encryptedCachedToken); } catch { /* stale */ }
                    }
                  }

                  if (!accessToken) {
                    const { token } = await generateTokenForUser(clientId, totpSecret, pin);
                    accessToken = token;
                    if (accessToken) {
                      const secretRef = db.collection("users").doc(userId).collection("secrets").doc(id);
                      await secretRef.update({
                        encryptedCachedToken: encrypt(accessToken),
                        cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      });
                    }
                  }

                  if (!accessToken) {
                    console.error(`[LiveExec] Could not obtain Dhan token for user ${userId} — skipping.`);
                    break;
                  }
                  apiKey = accessToken;
                  apiSecret = clientId;
                } else {
                  // Legacy: direct access token stored
                  apiKey = decrypt(data.encryptedKey);
                  apiSecret = decrypt(data.encryptedSecret);
                }
              } else {
                apiKey = decrypt(data.encryptedKey);
                apiSecret = decrypt(data.encryptedSecret);
              }

              // For Dhan: override leverage based on signal timeframe
              const effectiveSimTrade = brokerName === "DHAN"
                ? { ...simTrade, leverage: getDhanLeverage(simTrade.timeframe) }
                : simTrade;

              tasks.push({
                userId,
                exchange: brokerName,
                effectiveSimTrade,
                creds: {
                  apiKey,
                  apiSecret,
                  testnet: data.useTestnet === true,
                  exchangeSegment: isStock ? getExchangeSegment(signalExchange) : undefined,
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

      // Attempt exchange execution. On failure, retry once — but first check
      // whether the exchange already has a position open for this symbol to
      // avoid doubling up if the first attempt partially succeeded.
      let liveResult = await executeExchangeTrade(
        task.effectiveSimTrade,
        task.userId,
        simTradeId,
        simulatorCapital,
        task.creds,
        task.exchange,
        simConfig,
      );

      if (!liveResult.success) {
        const connector = getConnector(task.exchange);
        const exchangeSymbol = connector.normalizeSymbol(task.effectiveSimTrade.symbol);
        const existingPos = await connector.getPosition(exchangeSymbol, task.creds as ExchangeCredentials).catch(() => null);
        const alreadyOpen = existingPos && Math.abs(parseFloat(String(existingPos.positionAmt ?? 0))) > 0;

        if (alreadyOpen) {
          // First attempt placed the order but we lost the response — record
          // and stop. The position is tracked by the exchange; the Firestore
          // write below will still be skipped (liveResult.success is false).
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: "TRADE_ALREADY_OPEN",
            details: `${symbol} ${signalType} — execution reported failure but position exists on ${task.exchange}; skipping retry to avoid double-open. Manual review needed.`,
            signalId,
            symbol,
            userId: task.userId,
            exchange: task.exchange,
          }).catch(() => {});
        } else {
          // No position on exchange — safe to retry once
          await new Promise((r) => setTimeout(r, 1000));
          liveResult = await executeExchangeTrade(
            task.effectiveSimTrade,
            task.userId,
            simTradeId,
            simulatorCapital,
            task.creds,
            task.exchange,
            simConfig,
          );
          if (!liveResult.success) {
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "TRADE_FAILED_PERMANENT",
              details: `${symbol} ${signalType} — failed after 2 attempts on ${task.exchange} for user ${task.userId}: ${liveResult.error}. No further retries.`,
              signalId,
              symbol,
              userId: task.userId,
              exchange: task.exchange,
            }).catch(() => {});
          }
        }
      }

      if (liveResult.success && liveResult.trade) {
        // Use a pre-generated doc ID so retrying set() is idempotent —
        // if the first write succeeded but the network dropped before we got
        // the ack, retrying with the same ID just overwrites with the same data.
        const liveTradeRef = db.collection("live_trades").doc();
        let writeOk = false;
        for (let w = 1; w <= 3; w++) {
          try {
            await liveTradeRef.set(liveResult.trade);
            writeOk = true;
            break;
          } catch {
            if (w < 3) await new Promise((r) => setTimeout(r, 400 * w));
          }
        }

        if (!writeOk) {
          // All 3 write attempts failed. The exchange position is open but
          // untracked. Emergency-close it — principle: no Firestore record
          // = no live trade.
          const connector = getConnector(task.exchange);
          try { await connector.cancelAllOrders(liveResult.trade.symbol, task.creds as ExchangeCredentials); } catch {}
          try { await connector.placeMarketClose(liveResult.trade.symbol, liveResult.trade.side, liveResult.trade.quantity, task.creds as ExchangeCredentials); } catch {}
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: "LIVE_WRITE_FAILED_CLOSED",
            details: `${symbol} ${signalType} — live_trades write failed after 3 attempts on ${task.exchange}; emergency-closed to prevent ghost position`,
            signalId,
            symbol,
            userId: task.userId,
            exchange: task.exchange,
          }).catch(() => {});
          return { ...liveResult, success: false, error: "live_trades write failed after retries — exchange position closed" };
        }

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
