/**
 * POST /api/admin/migrate-bot-deployments
 * GET  /api/admin/migrate-bot-deployments?dryRun=1
 *
 * One-time backfill for the per-(user, exchange, bot) cap architecture.
 * Idempotent and safe to re-run.
 *
 * What it does
 * ------------
 * 1. **Populate `tradingPrefs` on every existing `bot_deployments` doc.**
 *    The cap (and the rest of TradingPrefs) used to live on
 *    `secrets/{exchange}` as a single per-exchange value. The new model
 *    keeps the source of truth on the deployment doc itself so each bot
 *    has its own quota — see `src/lib/freedombot/deployment-cap.ts`.
 *    For docs that don't have `tradingPrefs` yet we seed it from the
 *    user's secrets doc (legacy values), falling back to the per-bot
 *    default if even that is missing.
 *
 * 2. **Auto-create `bot_deployments` docs for opted-in zone bots.**
 *    Users who opted into a zone bot via `zoneBotsEnabled.{btc|eth|sol|
 *    xrp} === true` on their secrets doc never had a matching deployment
 *    doc — which means their zone trades had nowhere to land aggregates
 *    or per-bot prefs. We create one per opted-in (uid, exchange, bot)
 *    triple, tagged `source: "auto"` so it stays out of the public
 *    dashboard until the bot is `publicLive`. Credentials / identity are
 *    copied from the user's existing Crypto Bot deployment on the same
 *    exchange (they share API keys).
 *
 * 3. **Backfill `botSource` on legacy open `live_trades`.**
 *    Pre-zone-bot OPEN trades may be missing the `botSource` field
 *    (default `"PATTERN"` was added in commit `ead9dcc`). The new
 *    `live-execution` cap query filters on `botSource`, so any OPEN
 *    trade without the field would be invisible to the gate and the
 *    user could exceed their cap by 1 once. Setting `botSource:
 *    "PATTERN"` on every OPEN trade missing it closes that hole.
 *
 * 4. **Enforce per-bot Crypto cap bounds on existing docs.**
 *    Crypto Bot was given a per-bot floor of 3 and ceiling of 5 (see
 *    `MAX_CONCURRENT_BOUNDS_BY_BOT` in `trading-prefs-shared.ts`).
 *    The first migration faithfully copied each user's legacy
 *    `maxConcurrentTrades` from secrets — usually 1, the old
 *    platform default. This step re-walks every deployment, applies
 *    `clampMaxConcurrentForBot`, and writes the bumped value to
 *    both the deployment doc and the legacy secrets mirror.
 *    Crypto rows at cap=1 → 3; one outlier at cap=5 stays. Other
 *    bots are unconstrained, so no write.
 *
 * Modes
 * -----
 * • `GET ?dryRun=1` — returns counts of what would change without
 *   writing anything. Use this first to sanity-check the impact.
 * • `POST` — applies the migration. Returns the same counts the dry
 *   run would have, plus a list of created deployment ids for audit.
 *
 * Safety
 * ------
 * • Admin-only via `requireAdmin`.
 * • Idempotent: every write is "set if missing" / "merge field that
 *   isn't there yet". Re-running is a no-op once everything's migrated.
 * • Failures on individual docs are collected and returned; a single
 *   bad doc never aborts the migration.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { CRYPTO_BOTS, type DeployBotKey } from "@/lib/crypto-bots";
import { tradingPrefsFromSecret } from "@/lib/freedombot/trading-prefs";
import {
  defaultMaxConcurrentForBot,
  defaultTradingPrefsForBot,
} from "@/lib/freedombot/deployment-cap";
import {
  DEFAULT_TRADING_PREFS,
  clampMaxConcurrentForBot,
  type TradingPrefs,
} from "@/lib/freedombot/trading-prefs-shared";
import type { Firestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface MigrationReport {
  dryRun: boolean;
  deploymentsScanned: number;
  deploymentsBackfilled: number;
  zoneDeploymentsCreated: number;
  liveTradesBackfilled: number;
  /** Existing Crypto deployments whose cap was out of `[3, 5]` and got
   *  bumped to the nearest allowed value. Step 4 of the migration. */
  cryptoCapsClamped: number;
  /** Sample of (oldCap → newCap) pairs from the Crypto clamp step,
   *  useful for spot-checking on the dry run. */
  cryptoCapsClampedSample: { deploymentId: string; from: number; to: number }[];
  errors: { context: string; message: string }[];
  /** Newly-created zone-bot deployment ids — only present on a real run. */
  createdDeploymentIds?: string[];
}

/** Run the migration. Mode controlled by `dryRun`. */
async function runMigration(db: Firestore, dryRun: boolean): Promise<MigrationReport> {
  const report: MigrationReport = {
    dryRun,
    deploymentsScanned: 0,
    deploymentsBackfilled: 0,
    zoneDeploymentsCreated: 0,
    liveTradesBackfilled: 0,
    cryptoCapsClamped: 0,
    cryptoCapsClampedSample: [],
    errors: [],
    ...(dryRun ? {} : { createdDeploymentIds: [] }),
  };

  // ── Step 1+2: walk deployments and secrets in one pass ─────────────
  // We index existing deployments by (uid, exchange, bot) so step 2's
  // zone-bot creation can check existence without round-tripping.
  const deploymentsSnap = await db.collection("bot_deployments").get();
  report.deploymentsScanned = deploymentsSnap.size;

  const deploymentsIndex = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of deploymentsSnap.docs) {
    const data = doc.data();
    const uid = String(data.uid ?? "");
    const ex = String(data.exchange ?? "");
    const bot = String(data.bot ?? "");
    if (!uid || !ex || !bot) continue;
    deploymentsIndex.set(`${uid}::${ex}::${bot}`, doc);
  }

  // Cache one secrets doc per (uid, exchange) — same secret doc backs
  // every deployment on that exchange, so we read it once per pair.
  const secretsCache = new Map<string, Record<string, unknown> | null>();
  async function loadSecret(
    uid: string,
    exchange: string,
  ): Promise<Record<string, unknown> | null> {
    const key = `${uid}::${exchange}`;
    if (secretsCache.has(key)) return secretsCache.get(key) ?? null;
    // Walk the canonical doc ids for this exchange — same lookup the
    // live dispatcher uses (see live-execution.ts DOC_ID_TO_EXCHANGE).
    const docIds = ["bybit", "binance", "binance_futures", "mexc", "coindcx", "hyperliquid", "dhan"];
    for (const id of docIds) {
      const snap = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
      if (!snap.exists) continue;
      const data = snap.data() ?? null;
      // The dispatcher uses `docMatchesExchange`; this is a looser check
      // (any secret doc on that exchange suffices for prefs lookup) but
      // it's good enough for migration — TradingPrefs values are the
      // same across legacy doc ids.
      if (data && String(data.exchange ?? "").toUpperCase() === exchange.toUpperCase()) {
        secretsCache.set(key, data);
        return data;
      }
    }
    secretsCache.set(key, null);
    return null;
  }

  // ── Step 1: backfill tradingPrefs on existing deployments ──────────
  for (const doc of deploymentsSnap.docs) {
    const data = doc.data();
    const uid = String(data.uid ?? "");
    const exchange = String(data.exchange ?? "");
    const bot = String(data.bot ?? "");
    if (!uid || !exchange || !bot) continue;

    // Already migrated → nothing to do.
    if (data.tradingPrefs && typeof data.tradingPrefs === "object") {
      continue;
    }

    let tradingPrefs: TradingPrefs;
    const secret = await loadSecret(uid, exchange);
    if (secret) {
      const fromSecret = tradingPrefsFromSecret(secret);
      const explicitCap = secret.maxConcurrentTrades;
      const seedCap =
        typeof explicitCap === "number" && explicitCap > 0
          ? Math.trunc(explicitCap)
          : defaultMaxConcurrentForBot(bot);
      tradingPrefs = {
        riskPerTrade: fromSecret.riskPerTrade,
        // Clamp the seed value to per-bot bounds. For Crypto Bot
        // (bounds 3..5) this means a legacy secrets value of 1 lands
        // on the deployment as 3, not 1 — the whole point of the
        // bump. Other bots are unconstrained and pass through.
        maxConcurrentTrades: clampMaxConcurrentForBot(bot, seedCap),
        dailyLossLimit: fromSecret.dailyLossLimit,
      };
    } else {
      tradingPrefs = defaultTradingPrefsForBot(bot);
    }

    // `source: "user_deploy"` for existing docs — they were created via
    // the deploy flow, so the public dashboard should keep showing them.
    const update: Record<string, unknown> = {
      tradingPrefs,
    };
    if (!data.source) {
      update.source = "user_deploy";
    }

    if (!dryRun) {
      try {
        await doc.ref.update(update);
      } catch (e) {
        report.errors.push({
          context: `deployment ${doc.id} (${uid}/${exchange}/${bot})`,
          message: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    }
    report.deploymentsBackfilled++;
  }

  // ── Step 2: auto-create zone-bot deployments for opt-ins ───────────
  // Walk every secrets doc; for each user with zoneBotsEnabled.X=true,
  // ensure a matching bot_deployments doc exists on the same exchange.
  const ZONE_FIELD_TO_DEPLOY: Record<string, DeployBotKey> = {
    btc: "BTC",
    eth: "ETH",
    sol: "SOL",
    xrp: "XRP",
  };
  const allSecretsSnap = await db.collectionGroup("secrets").get();
  for (const secretDoc of allSecretsSnap.docs) {
    const data = secretDoc.data() ?? {};
    const enabledRaw = data.zoneBotsEnabled;
    if (!enabledRaw || typeof enabledRaw !== "object") continue;
    const enabled = enabledRaw as Record<string, unknown>;

    const uid = secretDoc.ref.parent.parent?.id;
    if (!uid) continue;
    const exchange = String(data.exchange ?? "").toUpperCase();
    if (!exchange) continue;

    for (const [field, deployKey] of Object.entries(ZONE_FIELD_TO_DEPLOY)) {
      if (enabled[field] !== true) continue;
      const indexKey = `${uid}::${exchange}::${deployKey}`;
      if (deploymentsIndex.has(indexKey)) continue;

      // Pull identity from the user's existing CRYPTO deployment on the
      // same exchange — keys, fingerprint, email all match.
      const cryptoSibling = deploymentsIndex.get(`${uid}::${exchange}::CRYPTO`);
      const siblingData = cryptoSibling?.data() ?? {};

      const tradingPrefs = defaultTradingPrefsForBot(deployKey);
      const docData: Record<string, unknown> = {
        uid,
        email: (siblingData.email as string | null) ?? null,
        displayName: (siblingData.displayName as string | null) ?? null,
        bot: deployKey,
        exchange,
        keyFingerprint: siblingData.keyFingerprint ?? null,
        keyLastFour: siblingData.keyLastFour ?? null,
        status: "active",
        createdAt: new Date(),
        tradingPrefs,
        source: "auto",
      };
      if (siblingData.exchangeUid) docData.exchangeUid = siblingData.exchangeUid;

      if (!dryRun) {
        try {
          const newRef = await db.collection("bot_deployments").add(docData);
          report.createdDeploymentIds?.push(newRef.id);
          // Add to index so a duplicate zoneBotsEnabled config across
          // multiple secrets docs (e.g. legacy `binance` + canonical
          // `bybit`) doesn't re-create.
          deploymentsIndex.set(indexKey, {
            ref: newRef,
            data: () => docData,
          } as unknown as FirebaseFirestore.QueryDocumentSnapshot);
        } catch (e) {
          report.errors.push({
            context: `zone deployment ${uid}/${exchange}/${deployKey}`,
            message: e instanceof Error ? e.message : String(e),
          });
          continue;
        }
      }
      report.zoneDeploymentsCreated++;
    }
  }

  // ── Step 3: backfill botSource on open live_trades ─────────────────
  // The cap query in live-execution filters by `botSource`, so any OPEN
  // doc missing the field becomes invisible to the gate. Default
  // "PATTERN" is correct for pre-zone-bot trades — zone trades have
  // had the field written explicitly since commit ead9dcc.
  const openTradesSnap = await db
    .collection("live_trades")
    .where("status", "==", "OPEN")
    .get();
  for (const tradeDoc of openTradesSnap.docs) {
    const data = tradeDoc.data();
    if (typeof data.botSource === "string" && data.botSource.length > 0) continue;
    if (!dryRun) {
      try {
        await tradeDoc.ref.update({ botSource: "PATTERN" });
      } catch (e) {
        report.errors.push({
          context: `live_trade ${tradeDoc.id}`,
          message: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    }
    report.liveTradesBackfilled++;
  }

  // ── Step 4: enforce per-bot Crypto cap bounds on existing docs ─────
  // The first migration pass landed `tradingPrefs` on every deployment
  // doc, but seeded each cap from the user's legacy secrets value —
  // which for most Crypto users was 1 (the old platform default). With
  // the per-bot floor of 3 introduced for Crypto, those docs need to
  // be bumped. We walk *every* deployment doc (cheap — already in
  // memory from step 1) and clamp `tradingPrefs.maxConcurrentTrades`
  // to the per-bot bounds via `clampMaxConcurrentForBot`. Anything
  // already inside the bounds is a no-op; this is what makes a
  // re-run idempotent. Only writes are emitted for docs that actually
  // change.
  for (const doc of deploymentsSnap.docs) {
    const data = doc.data();
    const bot = String(data.bot ?? "");
    if (!bot) continue;
    const prefs = data.tradingPrefs as Record<string, unknown> | undefined;
    const currentCap =
      typeof prefs?.maxConcurrentTrades === "number" ? prefs.maxConcurrentTrades : null;
    if (currentCap === null) continue;
    const clamped = clampMaxConcurrentForBot(bot, currentCap);
    if (clamped === currentCap) continue;

    if (report.cryptoCapsClampedSample.length < 10) {
      report.cryptoCapsClampedSample.push({
        deploymentId: doc.id,
        from: currentCap,
        to: clamped,
      });
    }

    if (!dryRun) {
      try {
        await doc.ref.update({
          // Use dot-path so we don't blow away other tradingPrefs fields.
          "tradingPrefs.maxConcurrentTrades": clamped,
        });
        // Mirror to the legacy secrets value (same write path as
        // trading-settings) so any remaining reader on that field sees
        // the bumped value too. Best-effort; errors don't fail the
        // migration.
        try {
          const exchange = String(data.exchange ?? "");
          const secret = exchange ? await loadSecret(String(data.uid ?? ""), exchange) : null;
          // Find the actual secret doc ref to update.
          if (secret) {
            // We don't track ref in loadSecret's cache; re-walk doc ids
            // to find the matching ref. Cheap — at most ~7 reads, and
            // capped by the number of clamp candidates.
            const docIds = ["bybit", "binance", "binance_futures", "mexc", "coindcx", "hyperliquid", "dhan"];
            const uid = String(data.uid ?? "");
            for (const id of docIds) {
              const ref = db.collection("users").doc(uid).collection("secrets").doc(id);
              const snap = await ref.get();
              if (
                snap.exists &&
                String(snap.data()?.exchange ?? "").toUpperCase() === exchange.toUpperCase()
              ) {
                await ref.update({ maxConcurrentTrades: clamped });
                break;
              }
            }
          }
        } catch (mirrorErr) {
          // Mirror failure isn't fatal — deployment doc is the source
          // of truth; secrets mirror is transitional.
          report.errors.push({
            context: `secrets mirror for deployment ${doc.id} (cap clamp)`,
            message: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
          });
        }
      } catch (e) {
        report.errors.push({
          context: `clamp cap on deployment ${doc.id} (${bot})`,
          message: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    }
    report.cryptoCapsClamped++;
  }

  return report;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") !== "0";
    const db = getAdminFirestore();
    const report = await runMigration(db, dryRun);
    return NextResponse.json({
      ok: true,
      report,
      hint: dryRun
        ? "Dry run only — pass ?dryRun=0 (or POST) to actually apply changes."
        : "Migration applied.",
      knownBots: CRYPTO_BOTS.map((b) => ({ deployKey: b.deployKey, defaultMaxConcurrent: defaultMaxConcurrentForBot(b.deployKey) })),
      platformDefault: DEFAULT_TRADING_PREFS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const db = getAdminFirestore();
    const report = await runMigration(db, false);
    return NextResponse.json({
      ok: true,
      report,
      hint: "Migration applied. Safe to re-run; subsequent calls are no-ops.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
