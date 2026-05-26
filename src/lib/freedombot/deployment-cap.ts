/**
 * Per-deployment cap resolution and zone-bot deployment provisioning.
 *
 * Background
 * ----------
 * `maxConcurrentTrades` was historically a single field on the user's
 * `secrets/{exchange}` doc — one number per exchange, shared across every
 * bot the user ran on that exchange. That model breaks down the moment a
 * user runs Crypto Bot + any zone bot on the same venue: a single OPEN
 * trade from one bot starved every other bot of slots, even though each
 * bot's simulator side runs an independent state machine.
 *
 * New model
 * ---------
 * The cap (and the rest of `tradingPrefs`) lives on the `bot_deployments`
 * doc, which is already per `(user, exchange, bot)`. `live-execution`
 * reads from there and counts OPEN trades per `(user, exchange, botSource)`
 * bucket — so each bot has its own quota.
 *
 * Per-bot defaults match the simulator's own concurrency:
 *   • Crypto Bot (PATTERN) → 3   (matches `MAX_OPEN_TRADES_BASE` in
 *                                 `sim-bot-settings.ts`).
 *   • Zone bots (BTC/ETH/SOL/XRP) → 1 each (each zone bot's sim runs
 *                                 one position at a time).
 *
 * Backwards-compat fallback chain:
 *   1. `bot_deployments/{id}.tradingPrefs.maxConcurrentTrades`
 *   2. `secrets/{exchange}.maxConcurrentTrades` (legacy single value)
 *   3. `defaultMaxConcurrentForBot(deployKey)`
 *
 * After the one-time backfill (`/api/admin/migrate-bot-deployments`),
 * every active deployment will have its own `tradingPrefs` so step 2 is
 * just defensive — and zone-bot opt-ins going forward auto-create their
 * deployment doc via `ensureBotDeployment`.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  cryptoBotByBotSource,
  isCryptoPerpDeployKey,
  type DeployBotKey,
} from "@/lib/crypto-bots";
import {
  DEFAULT_TRADING_PREFS,
  clampMaxConcurrentForBot,
  resolveDailyLossLimit,
  resolveRiskPerTrade,
  type TradingPrefs,
} from "./trading-prefs-shared";
import { tradingPrefsFromSecret } from "./trading-prefs";
import { getSecretDocIds, docMatchesExchange, type ExchangeName } from "@/lib/exchanges";

/** Per-bot default for `maxConcurrentTrades`. Matches each bot's sim
 *  cap so a user on the platform default gets the same parallelism the
 *  bot actually has signals for. Crypto bot's pattern engine runs up to
 *  3 trades concurrently; each zone bot runs 1.
 *
 *  Anything that isn't a recognised crypto deploy key falls through to
 *  the legacy platform default (1) — defensive; Indian/Gold/Silver bots
 *  aren't live today but if they ever ship they'll define their own
 *  default here. */
export function defaultMaxConcurrentForBot(deployKey: string): number {
  // Crypto Bot's per-bot bounds (floor 3, ceiling 5) live in
  // `MAX_CONCURRENT_BOUNDS_BY_BOT`. The default sits at the floor so
  // newly-deployed bots and unmigrated rows resolve to the lowest
  // allowed value, never below it. clampMaxConcurrentForBot is the
  // single source of truth — keep it in lockstep with this default.
  if (deployKey === "CRYPTO") return clampMaxConcurrentForBot("CRYPTO", 3);
  if (deployKey === "BTC" || deployKey === "ETH" || deployKey === "SOL" || deployKey === "XRP") {
    return 1;
  }
  return DEFAULT_TRADING_PREFS.maxConcurrentTrades;
}

/** Per-bot defaults for the full TradingPrefs object. Risk and daily loss
 *  follow the platform defaults — only the cap is per-bot today. */
export function defaultTradingPrefsForBot(deployKey: string): TradingPrefs {
  return {
    riskPerTrade: DEFAULT_TRADING_PREFS.riskPerTrade,
    maxConcurrentTrades: defaultMaxConcurrentForBot(deployKey),
    dailyLossLimit: DEFAULT_TRADING_PREFS.dailyLossLimit,
  };
}

/** Read tradingPrefs off a `bot_deployments` doc, applying per-bot
 *  defaults for any field that's missing. Safe to call on legacy docs
 *  that don't have a `tradingPrefs` object at all — caller gets a
 *  fully-populated TradingPrefs back. */
export function tradingPrefsFromDeployment(
  deploymentData: Record<string, unknown> | undefined | null,
  deployKey: string,
): TradingPrefs {
  const defaults = defaultTradingPrefsForBot(deployKey);
  const raw = deploymentData?.tradingPrefs as Record<string, unknown> | undefined;
  if (!raw) return defaults;
  return {
    riskPerTrade:
      typeof raw.riskPerTrade === "number"
        ? resolveRiskPerTrade(raw.riskPerTrade)
        : defaults.riskPerTrade,
    // Clamp on read — a stored value below the per-bot floor (e.g. a
    // legacy Crypto deployment that still carries 1 from the secrets
    // mirror) gets snapped up to the new minimum here without needing
    // a Firestore write. The one-shot migration also writes the
    // clamped value, but this guards against any path that reads
    // before the migration ran.
    maxConcurrentTrades: clampMaxConcurrentForBot(
      deployKey,
      typeof raw.maxConcurrentTrades === "number" && raw.maxConcurrentTrades > 0
        ? raw.maxConcurrentTrades
        : defaults.maxConcurrentTrades,
    ),
    dailyLossLimit:
      typeof raw.dailyLossLimit === "number"
        ? resolveDailyLossLimit(raw.dailyLossLimit)
        : defaults.dailyLossLimit,
  };
}

/** Resolve the deploy key (`CRYPTO`, `BTC`, `ETH`, `SOL`, `XRP`) for a
 *  `botSource`. Unknown sources collapse to `CRYPTO` to match the
 *  classifier in `bot-source-constants.ts`. */
export function deployKeyForBotSource(
  botSource: string | null | undefined,
): DeployBotKey {
  return (cryptoBotByBotSource(botSource)?.deployKey ?? "CRYPTO") as DeployBotKey;
}

/** Find the active `bot_deployments` doc for a user × exchange × bot,
 *  if one exists. Returns the snapshot so callers can read fields off
 *  the data directly. We prefer `status="active"` but fall back to the
 *  most recent paused/stopped doc — the cap setting on a paused doc is
 *  still the user's intent for that bot. */
export async function findDeploymentForBot(
  db: Firestore,
  uid: string,
  exchange: string,
  deployKey: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const snap = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .where("bot", "==", deployKey)
    .get();
  if (snap.empty) return null;

  const docs = snap.docs.sort((a, b) => {
    const aActive = String(a.data().status ?? "").toLowerCase() === "active" ? 0 : 1;
    const bActive = String(b.data().status ?? "").toLowerCase() === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aMs = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
    const bMs = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
    return bMs - aMs;
  });
  return docs[0];
}

/**
 * Resolve the effective `maxConcurrentTrades` for a `(user, exchange,
 * botSource)` bucket using the fallback chain documented at the top
 * of this file. Pass `secretData` to skip the secrets read when the
 * caller already has it in hand (live-execution does — it just walked
 * the collection-group).
 *
 * Returns `null` only when no cap should be enforced — never happens
 * today since the per-bot default is always a positive integer.
 */
export async function resolveDeploymentCap(
  db: Firestore,
  uid: string,
  exchange: string,
  botSource: string | null | undefined,
  secretData?: Record<string, unknown> | null,
): Promise<{ cap: number; source: "deployment" | "secret" | "default" }> {
  const deployKey = deployKeyForBotSource(botSource);
  const deployDoc = await findDeploymentForBot(db, uid, exchange, deployKey);
  if (deployDoc) {
    // tradingPrefsFromDeployment applies the per-bot clamp, so a Crypto
    // deployment that still stores cap=1 from a pre-migration write
    // reports its clamped value (3) to the live dispatcher.
    const prefs = tradingPrefsFromDeployment(deployDoc.data(), deployKey);
    if (prefs.maxConcurrentTrades > 0) {
      const raw = (deployDoc.data().tradingPrefs as Record<string, unknown> | undefined)
        ?.maxConcurrentTrades;
      // Distinguish "deployment doc had the field" from "we fell back
      // to per-bot default" — useful for log clarity even though the
      // numeric result is identical.
      if (typeof raw === "number" && raw > 0) {
        return { cap: prefs.maxConcurrentTrades, source: "deployment" };
      }
    }
  }
  if (secretData) {
    const legacy = secretData.maxConcurrentTrades;
    if (typeof legacy === "number" && legacy > 0) {
      // Legacy secrets value also gets clamped to the per-bot bounds
      // — without this, a Crypto user whose deployment doc is missing
      // tradingPrefs but whose secrets carries cap=1 would still trade
      // with cap=1, defeating the floor.
      return {
        cap: clampMaxConcurrentForBot(deployKey, legacy),
        source: "secret",
      };
    }
  }
  return { cap: defaultMaxConcurrentForBot(deployKey), source: "default" };
}

/**
 * Ensure a `bot_deployments` doc exists for a given (uid, exchange,
 * deployKey). Used by:
 *   • the deploy route (no-op when the user-deploy path already created
 *     one, but covers zone-bot opt-ins that flow through here),
 *   • the backfill admin endpoint (one-shot create for legacy users),
 *   • any future code path that flips `zoneBotsEnabled.X = true`.
 *
 * Idempotent: if any deployment doc already exists for this tuple
 * (active or paused), this is a no-op and returns the existing id.
 *
 * `source` defaults to "auto" — the freedombot.ai public dashboard
 * filters these out so the user doesn't suddenly see new tabs for bots
 * that aren't `publicLive` yet. When zone bots go publicLive, the flag
 * can be flipped to "user_deploy" (or the dashboard filter dropped).
 *
 * Sibling-data lookup (`copyFromDeployKey`, default `CRYPTO`): zone-bot
 * opt-ins share credentials and exchange identity with the user's
 * existing Crypto Bot deployment on the same exchange. We copy
 * keyFingerprint / keyLastFour / exchangeUid / email / displayName so
 * `live-execution`, admin views, and aggregates all see a complete
 * doc — not a half-populated stub.
 */
export async function ensureBotDeployment(
  db: Firestore,
  params: {
    uid: string;
    exchange: string;
    deployKey: string;
    /** Source of this auto-creation — "auto" hides from public dashboard
     *  until the bot becomes publicLive; "user_deploy" surfaces it. */
    source?: "auto" | "user_deploy";
    /** Deploy key to copy keyFingerprint / keyLastFour / exchangeUid /
     *  email / displayName from. Defaults to "CRYPTO" — the only user-
     *  facing deployable bot today. */
    copyFromDeployKey?: string;
    /** Override tradingPrefs (used by the deploy route when the user
     *  supplied explicit values in the form). Falls back to per-bot
     *  defaults when omitted. */
    tradingPrefs?: TradingPrefs;
  },
): Promise<{ deploymentId: string; created: boolean }> {
  const { uid, exchange, deployKey } = params;

  const existing = await findDeploymentForBot(db, uid, exchange, deployKey);
  if (existing) {
    return { deploymentId: existing.id, created: false };
  }

  // Pull sibling identity from another deployment on the same exchange
  // (defaults to the user's CRYPTO deployment — they share credentials).
  const siblingKey = params.copyFromDeployKey ?? "CRYPTO";
  const sibling =
    siblingKey === deployKey
      ? null
      : await findDeploymentForBot(db, uid, exchange, siblingKey);
  const siblingData = sibling?.data() ?? {};

  const tradingPrefs = params.tradingPrefs ?? defaultTradingPrefsForBot(deployKey);
  const now = new Date();

  const docRef = await db.collection("bot_deployments").add({
    uid,
    email: (siblingData.email as string | null) ?? null,
    displayName: (siblingData.displayName as string | null) ?? null,
    bot: deployKey,
    exchange,
    keyFingerprint: siblingData.keyFingerprint ?? null,
    keyLastFour: siblingData.keyLastFour ?? null,
    ...(siblingData.exchangeUid ? { exchangeUid: siblingData.exchangeUid } : {}),
    status: "active",
    createdAt: now,
    tradingPrefs,
    source: params.source ?? "auto",
  });

  return { deploymentId: docRef.id, created: true };
}

/**
 * Resolve a deployment's TradingPrefs using the fallback chain:
 *   deployment.tradingPrefs → secrets/{exchange} → per-bot defaults.
 *
 * Use this anywhere you currently call `loadTradingPrefs(db, uid,
 * exchange)` and want per-deployment values rather than the legacy
 * per-exchange single value. Read sites (my-deployment, admin detail,
 * trading-settings response) call this; the live dispatcher calls
 * `resolveDeploymentCap` directly because it only needs the cap.
 */
export async function loadTradingPrefsForDeployment(
  db: Firestore,
  uid: string,
  exchange: string,
  deployKey: string,
  /** Pre-fetched deployment data when the caller already has it (avoids
   *  a second Firestore round-trip). */
  deploymentData?: Record<string, unknown> | null,
): Promise<TradingPrefs> {
  const defaults = defaultTradingPrefsForBot(deployKey);

  let data = deploymentData ?? null;
  if (!data) {
    const doc = await findDeploymentForBot(db, uid, exchange, deployKey);
    data = doc?.data() ?? null;
  }

  const onDeployment = (data?.tradingPrefs as Record<string, unknown> | undefined) ?? null;
  if (onDeployment) {
    return tradingPrefsFromDeployment(data, deployKey);
  }

  // No prefs on the deployment doc yet — fall back to the legacy
  // secrets value (one-per-exchange) so existing users see the same
  // numbers they configured before the migration.
  const exchangeName = exchange as ExchangeName;
  for (const docId of getSecretDocIds(exchangeName)) {
    const secretDoc = await db
      .collection("users")
      .doc(uid)
      .collection("secrets")
      .doc(docId)
      .get();
    if (
      secretDoc.exists &&
      docMatchesExchange(secretDoc.data()!, exchangeName, docId)
    ) {
      const fromSecret = tradingPrefsFromSecret(secretDoc.data()!);
      // Cap follows the per-bot default when the secrets doc only has
      // the legacy single number — that's the whole point of the
      // migration. Risk and daily-loss are still platform-wide today,
      // so the secrets value is honoured for those. Clamp the secrets
      // value to the per-bot bounds so a stale legacy 1 on a Crypto
      // user still lands at the new floor (3).
      const legacyCap = (secretDoc.data() as Record<string, unknown>).maxConcurrentTrades;
      return {
        riskPerTrade: fromSecret.riskPerTrade,
        maxConcurrentTrades: clampMaxConcurrentForBot(
          deployKey,
          typeof legacyCap === "number" ? legacyCap : defaults.maxConcurrentTrades,
        ),
        dailyLossLimit: fromSecret.dailyLossLimit,
      };
    }
  }

  return defaults;
}

/** Convenience wrapper for zone-bot opt-ins (when a user flips
 *  `zoneBotsEnabled.X = true` on their secrets doc). Returns null
 *  for non-zone deploy keys — Crypto Bot deployments are always
 *  user-initiated and go through the regular deploy flow. */
export async function ensureZoneBotDeployment(
  db: Firestore,
  uid: string,
  exchange: string,
  deployKey: DeployBotKey,
): Promise<{ deploymentId: string; created: boolean } | null> {
  if (deployKey === "CRYPTO") return null;
  if (!isCryptoPerpDeployKey(deployKey)) return null;
  return ensureBotDeployment(db, { uid, exchange, deployKey, source: "auto" });
}
