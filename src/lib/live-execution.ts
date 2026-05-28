import { FieldValue } from "firebase-admin/firestore";
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
  getSecretDocId,
  type ExchangeCredentials,
} from "./exchanges";
import type { SimTrade, SimConfigType } from "./simulator";
import { isIndianMarketEntryAllowed } from "./market-hours";
import { getDhanLeverage } from "./exchanges/dhan";
import { generateTokenForUser } from "./dhan-token";
import { applyTradeChangeToAggregates } from "./freedombot/aggregates";
import { refreshDeploymentWalletBalance } from "./freedombot/wallet-balance";
import { userOptedIntoBot } from "./freedombot/zone-bot-subscription";
import { resolveRiskPerTrade, type TradingPrefs } from "./freedombot/trading-prefs-shared";
import { isDailyLossHaltedToday } from "./freedombot/daily-loss-gate";
import { isLiveMirroringEnabledForBotSource } from "./bot-policy";
import {
  defaultMaxConcurrentForBot,
  deployKeyForBotSource,
  tradingPrefsFromDeployment,
} from "./freedombot/deployment-cap";
import type { ZoneBotAsset } from "./zone-bot-config";
import { ATTACH_LOG_KEYS } from "./crypto-bot-attach";

/** Optional context passed by the Crypto Bot ↔ Zone Bot attach engine
 *  (`src/lib/crypto-bot-attach-live.ts`) when fanning a mirror trade
 *  out to Crypto Bot subscribers. When set:
 *
 *    • Users whose secrets doc has `zoneBotsEnabled[attachedFromAsset]
 *      === true` are SKIPPED with `ATTACH_SKIP_SYMBOL_ALREADY_OPEN` —
 *      they will receive (or have already received) the trade via the
 *      solo-zone fan-out in the same cron tick, so the mirror would
 *      be a duplicate. Solo always supersedes attach, silently.
 *
 *  When `undefined` (default for every existing call site), behaviour
 *  is byte-for-byte identical to the pre-PR-2c implementation. */
export interface AttachContext {
  /** Originating zone bot asset — e.g. "btc". The secrets doc field
   *  `zoneBotsEnabled.<asset>` is the dedup discriminator. */
  attachedFromAsset: ZoneBotAsset;
}

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
  /** PR 2c — Crypto Bot ↔ Zone Bot attach hook. When provided, adds
   *  ONE extra discovery-loop skip: any user already subscribed to the
   *  originating solo zone (via `zoneBotsEnabled[asset] === true`) is
   *  filtered out so they don't get a duplicate fill. Undefined for
   *  every non-attach caller — zero behavioural change. */
  attachContext?: AttachContext,
) {
  const isStock = isStockExchange(signalExchange);

  // ── Bot-level live mirroring gate ─────────────────────────────────
  // Read the bot's "SIM ONLY vs SIM + LIVE" policy at fan-out time.
  // CRITICAL: this check must live here (in the dispatch function),
  // not upstream where the sim trade was decided. Otherwise an admin
  // who flips the toggle OFF between sim-trade creation and live
  // dispatch would still see live mirrors fire because the decision
  // would have been baked in earlier. Running trades are unaffected:
  // SL/TP/TRAILING/KILL_SWITCH cascades always follow sim regardless
  // of this flag (see `sync-live-trades` and `sim/force-close`).
  //
  // Backwards compat: `isLiveMirroringEnabledForBotSource` defaults to
  // true for any unknown bot or missing field, so existing bots that
  // were live-mirroring before this gate existed keep doing so.
  const liveMirroringAllowed = await isLiveMirroringEnabledForBotSource(
    db,
    botSource,
  );
  if (!liveMirroringAllowed) {
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "BOT_POLICY_SIM_ONLY",
      details: `${symbol} ${signalType} — live mirroring is disabled for ${botSource} (SIM ONLY mode). No live entries dispatched. Existing open mirrors remain on their normal lifecycle.`,
      signalId,
      symbol,
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
    });
    return;
  }

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
    /** Effective per-(user, exchange, bot) cap resolved from the
     *  deployment doc (or fallback secrets / per-bot default). See
     *  `src/lib/freedombot/deployment-cap.ts`. */
    maxConcurrentTrades: number;
  }

  const tasks: UserExecutionTask[] = [];

  // ── Batch-load deployments for this bot so prefs lookups are O(1) ──
  // Old model: tradingPrefs (cap + risk + daily loss) lived on the
  // secrets doc (one set per exchange, shared across every bot a user
  // ran on that venue). After the May 26 migration the authoritative
  // values are per-deployment, so we pre-fetch the (uid, exchange) map
  // once per signal — beats N queries during task creation, and lets
  // us read both the cap and the risk% with one lookup. The secrets
  // fallback below stays in place for any deployment doc that's
  // missing tradingPrefs (e.g. paused, manually edited, or a future
  // auto-created zone-bot doc that pre-dates the field).
  const deployKeyForCap = deployKeyForBotSource(botSource);
  const capDefaultForBot = defaultMaxConcurrentForBot(deployKeyForCap);
  const deploymentPrefsByUidExchange = new Map<string, TradingPrefs>();
  try {
    const deploySnap = await db
      .collection("bot_deployments")
      .where("bot", "==", deployKeyForCap)
      .get();
    for (const doc of deploySnap.docs) {
      const data = doc.data();
      const status = String(data.status ?? "").toLowerCase();
      if (status !== "active") continue;
      const uidVal = String(data.uid ?? "");
      const exVal = String(data.exchange ?? "");
      if (!uidVal || !exVal) continue;
      const prefs = tradingPrefsFromDeployment(data, deployKeyForCap);
      deploymentPrefsByUidExchange.set(`${uidVal}::${exVal}`, prefs);
    }
  } catch (e) {
    console.warn(
      `[LiveExec] deployment prefs pre-fetch failed (${deployKeyForCap}): ${
        e instanceof Error ? e.message : String(e)
      } — falling back to secrets+default per task.`,
    );
  }

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
  const discoverySkips: Record<string, number> = {
    unknown_doc_id: 0,
    wrong_asset_class: 0,
    exchange_mismatch: 0,
    bot_opt_out: 0,
    duplicate: 0,
    daily_loss_halt: 0,
    attach_solo_supersedes: 0,
  };
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
      if (!exchangeName) {
        discoverySkips.unknown_doc_id++;
        continue;
      }
      if (!allowedExchanges.has(exchangeName)) {
        discoverySkips.wrong_asset_class++;
        continue;
      }

      const data = secretDoc.data() ?? {};
      if (!docMatchesExchange(data, exchangeName, secretDoc.id)) {
        discoverySkips.exchange_mismatch++;
        const stored = String(data.exchange ?? "(missing)");
        console.warn(
          `[LiveExec] Skipping user ${userId} secrets/${secretDoc.id}: stored exchange=${stored} does not match ${exchangeName}`,
        );
        continue;
      }
      const storedExchange = data.exchange as string | undefined;
      if (
        storedExchange &&
        storedExchange.toUpperCase() !== exchangeName &&
        secretDoc.id === getSecretDocId(exchangeName)
      ) {
        console.warn(
          `[LiveExec] secrets/${secretDoc.id} for user ${userId} has stale exchange=${storedExchange}; dispatching as ${exchangeName} based on doc path`,
        );
      }
      // Per-bot opt-in gate. PATTERN trades always pass (legacy behaviour
      // for existing autoTradeEnabled users). Zone-bot trades require the
      // user to explicitly enable that specific bot via
      // `zoneBotsEnabled.<bot> === true` in their settings — opt-in by
      // design, never opt-out.
      if (!userOptedIntoBot(data, botSource)) {
        discoverySkips.bot_opt_out++;
        continue;
      }

      if (isDailyLossHaltedToday(data)) {
        discoverySkips.daily_loss_halt++;
        continue;
      }

      // PR 2c: solo-zone supersession. When a Crypto Bot mirror is
      // being fanned out (attachContext set) and this user is ALREADY
      // subscribed to the originating solo zone bot, skip the mirror.
      // They will receive the trade via the solo zone's own
      // executeForAllUsers call which runs in the same cron tick. We
      // emit a per-user log so an admin can audit silent skips, but the
      // user-facing effect is zero — they get exactly one fill, sized
      // by the solo zone's risk×capital. Disabling the solo opt-in
      // later flips them onto the mirror path on the NEXT signal with
      // no further action needed.
      if (attachContext) {
        const zoneMap = data.zoneBotsEnabled as Record<string, boolean> | undefined;
        if (zoneMap?.[attachContext.attachedFromAsset] === true) {
          discoverySkips.attach_solo_supersedes++;
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: ATTACH_LOG_KEYS.skipSymbolAlreadyOpen,
            details: `${symbol} ${signalType} — user ${userId} is subscribed to ${attachContext.attachedFromAsset.toUpperCase()} solo zone; mirror skipped (solo path delivers this trade).`,
            signalId,
            symbol,
            userId,
            exchange: exchangeName,
            attachedFromAsset: attachContext.attachedFromAsset,
            assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
          }).catch(() => {});
          continue;
        }
      }

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) {
        discoverySkips.duplicate++;
        continue;
      }

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

        // Resolve effective cap AND risk for this (uid, exchange, bot)
        // bucket. Same fallback chain for both, matching the read
        // helpers in `deployment-cap.ts` (`resolveDeploymentCap` /
        // `loadTradingPrefsForDeployment`):
        //   1. deployment doc's `tradingPrefs.*` (pre-fetched above),
        //   2. legacy `secrets.*` (one-per-exchange, kept for back-
        //      compat until trading-settings stops mirroring),
        //   3. per-bot platform default (Crypto cap=3, zones cap=1;
        //      `resolveRiskPerTrade` returns platform-default risk).
        // Risk used to come from secrets unconditionally — that was
        // the coherence gap closed by this commit. Behaviour is
        // unchanged when deployment and secrets agree (they do for
        // every existing user after the May 26 migration); the
        // deployment value wins only when the two drift.
        const deploymentPrefs = deploymentPrefsByUidExchange.get(
          `${userId}::${exchangeName}`,
        );

        let resolvedCap = deploymentPrefs?.maxConcurrentTrades;
        if (resolvedCap == null || resolvedCap <= 0) {
          if (typeof data.maxConcurrentTrades === "number" && data.maxConcurrentTrades > 0) {
            resolvedCap = Math.trunc(data.maxConcurrentTrades);
          } else {
            resolvedCap = capDefaultForBot;
          }
        }

        // `tradingPrefsFromDeployment` already applies
        // `resolveRiskPerTrade` (mapping legacy 0.5% → 1% and falling
        // back to platform default on invalid values), so the
        // deployment-derived value is always valid when present.
        const resolvedRisk = deploymentPrefs
          ? deploymentPrefs.riskPerTrade
          : resolveRiskPerTrade(data.riskPerTrade);

        tasks.push({
          userId,
          exchange: exchangeName,
          effectiveSimTrade,
          creds: {
            apiKey,
            apiSecret,
            testnet: data.useTestnet === true,
            exchangeSegment: isStock ? getExchangeSegment(signalExchange) : undefined,
            riskPerTradePct: resolvedRisk,
          },
          maxConcurrentTrades: resolvedCap,
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
    const skipDetail = Object.entries(discoverySkips)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(", ");
    await db.collection("live_trade_logs").add({
      timestamp: new Date().toISOString(),
      action: "SKIPPED",
      details: `${symbol} ${signalType} — no qualifying auto-trade users (${scannedSecrets} secret(s) scanned${skipDetail ? `; filtered: ${skipDetail}` : ""})`,
      signalId,
      symbol,
      assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
    });
    return;
  }

  const perExchangeCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.exchange] = (acc[t.exchange] ?? 0) + 1;
    return acc;
  }, {});
  const exchangeBreakdown = Object.entries(perExchangeCounts)
    .map(([ex, n]) => `${ex}=${n}`)
    .join(", ");
  const skipTotal = Object.values(discoverySkips).reduce((a, b) => a + b, 0);
  const skipSummary = skipTotal > 0
    ? ` (${scannedSecrets} secret(s) scanned; skipped: ${Object.entries(discoverySkips).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(", ")})`
    : "";

  await db.collection("live_trade_logs").add({
    timestamp: new Date().toISOString(),
    action: "EVALUATING",
    details: `${symbol} ${signalType} — dispatching ${tasks.length} live open(s) [${exchangeBreakdown}]${skipSummary}`,
    signalId,
    symbol,
    assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
  });

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      // ── Dispatch ticket: claim a slot before any side-effect ─────────
      // Idempotency guarantee for the fan-out. The key is per
      // (simTradeId, userId, exchange) so a cron retry / restart /
      // double-invoke of `executeForAllUsers` with the same simTrade
      // can't open the same position twice for the same user. `create()`
      // throws on ALREADY_EXISTS, which we treat as the duplicate
      // signal and skip silently with a DISPATCH_DUPLICATE_SKIP log.
      // Any OTHER write failure (Firestore blip, quota, etc.) is logged
      // but NOT fatal — we proceed without the guard so a transient
      // infra error never silently drops a real trade. The finalize
      // helper below is a no-op when `claimed` stayed false.
      //
      // The same doc doubles as the A4-lite observability artifact:
      // status flips DISPATCHING → EXECUTED|FAILED with `reason` and
      // `liveTradeId` so an operator can answer "what happened to user
      // X for signal Y" via a single doc lookup. Filter-stage skips
      // (no creds, paused, daily-loss-halt) are NOT written here yet —
      // that's the full A4 follow-up. Cap-reached skips ARE written
      // because they live inside the per-task closure.
      const dispatchKey = `${simTradeId}__${task.userId}__${task.exchange}`;
      const dispatchRef = db.collection("dispatch_state").doc(dispatchKey);
      let dispatchClaimed = false;
      try {
        await dispatchRef.create({
          simTradeId,
          userId: task.userId,
          exchange: task.exchange,
          bot: deployKeyForCap,
          botSource,
          symbol: task.effectiveSimTrade.symbol,
          side: task.effectiveSimTrade.side,
          status: "DISPATCHING",
          attemptCount: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        dispatchClaimed = true;
      } catch (e: unknown) {
        const err = e as { code?: number | string; message?: string };
        const code = err?.code;
        const msg = err?.message ?? String(e);
        const alreadyExists =
          code === 6 ||
          code === "already-exists" ||
          /already exists/i.test(msg);
        if (alreadyExists) {
          await db
            .collection("live_trade_logs")
            .add({
              timestamp: new Date().toISOString(),
              action: "DISPATCH_DUPLICATE_SKIP",
              details: `${symbol} ${signalType} — duplicate dispatch for user ${task.userId} on ${task.exchange}; another run already claimed this slot (key=${dispatchKey})`,
              signalId,
              symbol,
              userId: task.userId,
              exchange: task.exchange,
              assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
            })
            .catch(() => {});
          return { success: false, error: "duplicate dispatch (idempotency guard)" };
        }
        // Some other Firestore error — log loudly, proceed WITHOUT the
        // guard. Today's behaviour is preserved: trade still opens, we
        // just lose idempotency for this one task. If this fires
        // repeatedly across users, it'll be visible as a cluster of
        // warnings + missing dispatch_state docs.
        console.warn(
          `[LiveExec] dispatch_state claim failed for ${dispatchKey}: ${msg} — proceeding without idempotency guard.`,
        );
      }

      // Finalize the dispatch ticket from any exit point in this
      // closure. No-op when `dispatchClaimed` is false (claim failed
      // non-fatally above, OR another run owns the slot). Always
      // wrapped in try/catch — a Firestore failure here MUST NOT
      // affect the trade outcome.
      const finalizeDispatch = async (
        status: "EXECUTED" | "FAILED",
        reason: string | null,
        liveTradeId: string | null,
      ) => {
        if (!dispatchClaimed) return;
        try {
          await dispatchRef.update({
            status,
            reason,
            liveTradeId,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn(
            `[LiveExec] dispatch_state finalize failed for ${dispatchKey}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      };

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

      const maxOpen = task.maxConcurrentTrades;
      if (maxOpen != null && maxOpen > 0) {
        // Count OPEN trades only for THIS bot's bucket. Before the
        // migration the query was per (uid, exchange), which let
        // Crypto Bot's filled slot block every zone bot's entries on
        // the same venue. Each bot now has its own quota.
        const openSnap = await db
          .collection("live_trades")
          .where("userId", "==", task.userId)
          .where("exchange", "==", task.exchange)
          .where("botSource", "==", botSource)
          .where("status", "==", "OPEN")
          .get();
        if (openSnap.size >= maxOpen) {
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: "SKIPPED",
            details: `${symbol} ${signalType} — max concurrent trades on ${task.exchange} for ${botSource} (${openSnap.size}/${maxOpen} open); skipping new entry.`,
            signalId,
            symbol,
            userId: task.userId,
            exchange: task.exchange,
            assetType: isStock ? "INDIAN_STOCKS" : "CRYPTO",
          }).catch(() => {});
          await finalizeDispatch("FAILED", `CAP_REACHED:${openSnap.size}/${maxOpen}`, null);
          return { success: false, error: `Max concurrent trades (${maxOpen}) reached on ${task.exchange} for ${botSource}` };
        }
      }

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
              details: `${symbol} ${signalType} — failed after 2 attempts on ${task.exchange} for user ${task.userId}: ${(liveResult.error ?? "").replace(/\.\s*$/, "")}. No further retries.`,
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

          // Opportunistic wallet refresh: a trade just opened, so the user's
          // available margin has changed. Refresh the deployment's cached
          // wallet snapshot now (bypassing the cron's 30-min throttle) so
          // the admin dashboard shows the real post-entry balance. We
          // already have creds in hand; the marginal cost is one venue
          // API call + one Firestore write per opened trade.
          (async () => {
            try {
              const deploySnap = await db
                .collection("bot_deployments")
                .where("uid", "==", task.userId)
                .where("exchange", "==", task.exchange)
                .where("status", "==", "active")
                .limit(1)
                .get();
              if (deploySnap.empty) return;
              await refreshDeploymentWalletBalance(
                db,
                deploySnap.docs[0].ref,
                task.exchange,
                task.creds as ExchangeCredentials,
              );
            } catch (e) {
              console.warn(
                `[live-execution] opportunistic wallet refresh failed: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              );
            }
          })();
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
          await finalizeDispatch("FAILED", "WRITE_FAILED_CLOSED", null);
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
        await finalizeDispatch("EXECUTED", null, liveTradeRef.id);
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
        await finalizeDispatch("FAILED", liveResult.error ?? "execute_failed", null);
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
