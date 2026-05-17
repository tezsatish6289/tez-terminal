import { executeTrade as executeExchangeTrade, type Credentials } from "./trade-engine";
import { decrypt, encrypt } from "./crypto";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  STOCK_BROKERS,
  CRYPTO_BROKERS,
  isStockExchange,
  getExchangeSegment,
  docMatchesExchange,
  getConnector,
  type ExchangeCredentials,
} from "./exchanges";
import type { SimTrade, SimConfigType } from "./simulator";
import { isIndianMarketEntryAllowed } from "./market-hours";
import { getDhanLeverage } from "./exchanges/dhan";
import { generateTokenForUser } from "./dhan-token";
import { applyTradeChangeToAggregates } from "./freedombot/aggregates";
import { userOptedIntoBot } from "./freedombot/zone-bot-subscription";

/**
 * Execute a trade for ALL users who have autoTradeEnabled on any supported exchange.
 * Each user is executed independently via Promise.allSettled.
 *
 * Shared across:
 *   - webhook/route.ts  (immediate signal → live)
 *   - sync-simulator/route.ts  (incubated signal → live)
 *   - sync-zone-bots/route.ts  (zone-bot signal → live, gated by per-bot opt-in)
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
  /** Origin bot. "PATTERN" (default) → existing autoTradeEnabled users
   *  receive the mirror, matching legacy behaviour. Non-PATTERN values
   *  (e.g. "BTC_ZONE") additionally require an explicit per-bot opt-in
   *  on the user's secrets doc (see userOptedIntoBot). Existing pattern-
   *  bot users are NOT auto-enrolled into any zone bot. */
  botSource: string = "PATTERN",
) {
  const isStock = isStockExchange(signalExchange);

  // Block new Indian stock entries after 2:30 PM IST
  if (isStock && !isIndianMarketEntryAllowed()) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "SKIPPED",
      details: `${symbol} ${signalType} — past 2:30 PM IST entry cutoff. No new intraday positions opened.`,
      signalId,
      symbol,
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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

  // Discover auto-trade users via a single collection-group query on the
  // `secrets` subcollection. Iterating `collection("users").get()` and then
  // walking each user's secrets would MISS any user whose parent
  // `users/{uid}` document was never written (Firestore does not return
  // those from `.get()`). FreedomBot deploy writes only the secrets
  // subdoc, so those users would otherwise be silently skipped here while
  // still showing up in admin views and `sync-live-trades` (which already
  // uses the same collection-group pattern). See:
  //   src/app/api/cron/sync-live-trades/route.ts (mirror implementation)
  //   src/app/api/freedombot/deploy/route.ts     (only writes secrets)
  //
  // Mapping mirrors `getSecretDocIds()` and `docMatchesExchange()` so
  // legacy migrated docs (e.g. `secrets/binance` holding Bybit keys
  // pre-migration) keep working.
  const DOC_ID_TO_EXCHANGE: Record<string, ExchangeName> = {
    bybit:           "BYBIT",
    binance:         "BYBIT",   // legacy pre-migration doc
    binance_futures: "BINANCE",
    mexc:            "MEXC",
    coindcx:         "COINDCX",
    hyperliquid:     "HYPERLIQUID",
    dhan:            "DHAN",
  };

  let scannedSecrets = 0;
  try {
    const enabledSnap = await db
      .collectionGroup("secrets")
      .where("autoTradeEnabled", "==", true)
      .get();
    scannedSecrets = enabledSnap.size;

    const seen = new Set<string>();
    const brokerList: readonly ExchangeName[] = isStock ? STOCK_BROKERS : CRYPTO_BROKERS;
    const allowedExchanges = new Set<ExchangeName>(brokerList);

    // Prefer canonical doc ids (e.g. `bybit` over legacy `binance`) when both
    // exist for the same user × exchange. `getSecretDocIds(exchange)[0]` is
    // the canonical one. We process canonical secrets first by sorting.
    const orderedDocs = [...enabledSnap.docs].sort((a, b) => {
      const aLegacy = a.id === "binance" ? 1 : 0;
      const bLegacy = b.id === "binance" ? 1 : 0;
      return aLegacy - bLegacy;
    });

    for (const secretDoc of orderedDocs) {
      const userId = secretDoc.ref.parent.parent?.id;
      if (!userId) continue;

      const exchangeName = DOC_ID_TO_EXCHANGE[secretDoc.id];
      if (!exchangeName) continue;
      if (!allowedExchanges.has(exchangeName)) continue;

      const data = secretDoc.data() ?? {};
      if (!docMatchesExchange(data, exchangeName, secretDoc.id)) continue;
      // Per-bot opt-in gate. PATTERN trades always pass (legacy behaviour
      // for existing autoTradeEnabled users). Zone-bot trades require the
      // user to explicitly enable that specific bot via
      // `zoneBotsEnabled.<bot> === true` in their settings — opt-in by
      // design, never opt-out.
      if (!userOptedIntoBot(data, botSource)) continue;

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) continue;

      try {
        let apiKey: string;
        let apiSecret: string;

        if (exchangeName === "DHAN") {
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
                await secretDoc.ref.update({
                  encryptedCachedToken: encrypt(accessToken),
                  cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                });
              }
            }

            if (!accessToken) {
              console.error(`[LiveExec] Could not obtain Dhan token for user ${userId} — skipping.`);
              continue;
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
        const effectiveSimTrade = exchangeName === "DHAN"
          ? { ...simTrade, leverage: getDhanLeverage(simTrade.timeframe) }
          : simTrade;

        tasks.push({
          userId,
          exchange: exchangeName,
          effectiveSimTrade,
          creds: {
            apiKey,
            apiSecret,
            testnet: data.useTestnet === true,
            exchangeSegment: isStock ? getExchangeSegment(signalExchange) : undefined,
          },
        });
        seen.add(dedupeKey);
      } catch (e) {
        // Decrypt / Dhan-token / unexpected error — surface to live_trade_logs
        // so an operator can see why a user got silently dropped. Previously
        // this was swallowed with `catch { continue }` which is exactly how
        // the FreedomBot-only users became invisible after deploy.
        console.error(
          `[LiveExec] Skipping ${exchangeName} for user ${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "SKIPPED",
          details: `${symbol} ${signalType} — failed to load ${exchangeName} credentials for user ${userId}: ${e instanceof Error ? e.message : String(e)}`,
          signalId,
          symbol,
          userId,
          exchange: exchangeName,
          assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error(`[LiveExec] collectionGroup(secrets) query failed: ${e instanceof Error ? e.message : String(e)}`);
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "ERROR",
      details: `${symbol} ${signalType} — failed to discover auto-trade users: ${e instanceof Error ? e.message : String(e)}`,
      signalId,
      symbol,
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
    }).catch(() => {});
    return;
  }

  if (tasks.length === 0) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "SKIPPED",
      details: `${symbol} ${signalType} — no users with auto-trade enabled on any exchange. (${scannedSecrets} secret(s) scanned)`,
      signalId,
      symbol,
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
    });
    return;
  }

  await db.collection("live_trade_logs").add({
    timestamp: new Date().toISOString(),
    action: "EVALUATING",
    details: `${symbol} ${signalType} — found ${tasks.length} qualifying user(s) across exchanges: ${[...new Set(tasks.map(t => t.exchange))].join(", ")}`,
    signalId,
    symbol,
    assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
        assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
        botSource,
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
            assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
            botSource,
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
              assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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

        // Bump the per-deployment open-trade counter as soon as the trade
        // doc lands. Failures here never block the trade itself — the
        // cold-path rebuild (admin "Sync PNL" / read-time bootstrap) heals
        // any drift.
        if (writeOk) {
          try {
            await applyTradeChangeToAggregates(db, null, {
              userId: liveResult.trade.userId,
              exchange: liveResult.trade.exchange,
              status: liveResult.trade.status,
              testnet: liveResult.trade.testnet,
              side: liveResult.trade.side,
              entryPrice: liveResult.trade.entryPrice,
              currentPrice: liveResult.trade.currentPrice,
              positionSize: liveResult.trade.positionSize,
              realizedPnl: liveResult.trade.realizedPnl,
              exchangeRealizedPnl: liveResult.trade.exchangeRealizedPnl,
              exchangeRealizedPnlOverride: liveResult.trade.exchangeRealizedPnlOverride,
              events: liveResult.trade.events,
            });
          } catch (e) {
            console.warn(`[live-execution] aggregate bump on open failed: ${e instanceof Error ? e.message : String(e)}`);
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
            assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
          assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
          assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
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
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
    });
  }
}
