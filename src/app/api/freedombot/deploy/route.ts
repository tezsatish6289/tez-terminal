import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { encrypt } from "@/lib/crypto";
import { getConnector, getSecretDocId } from "@/lib/exchanges";
import type { ExchangeName, ExchangeCredentials } from "@/lib/exchanges";
import { persistWalletBalanceSnapshot } from "@/lib/freedombot/wallet-balance";
import {
  DEFAULT_TRADING_PREFS,
  validateTradingPrefsUpdate,
} from "@/lib/freedombot/trading-prefs";
import { clampMaxConcurrentForBot } from "@/lib/freedombot/trading-prefs-shared";
import {
  CRYPTO_PERP_DEPLOY_KEYS,
  CRYPTO_PERP_EXCHANGES,
  zoneFieldFromDeployKey,
} from "@/lib/crypto-bots";
import { zoneBotsEnabledFieldKey } from "@/lib/freedombot/zone-bot-subscription";
import { loadUserExchangeSecret } from "@/lib/freedombot/user-exchange-secret";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// ─── HMAC fingerprint (exchange + primary credential) ────────────────────────

function computeFingerprint(
  exchange: string,
  primaryCredential: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${exchange}:${primaryCredential}`)
    .digest("hex");
}

// ─── Validation ──────────────────────────────────────────────────────────────

const ALLOWED_BOTS = new Set([
  ...CRYPTO_PERP_DEPLOY_KEYS,
  "INDIAN_STOCKS",
  "GOLD",
  "SILVER",
]);
const ALLOWED_EXCHANGES: Record<string, string[]> = {
  INDIAN_STOCKS: ["ZERODHA", "UPSTOX", "ANGEL_ONE", "DHAN"],
};
for (const key of CRYPTO_PERP_DEPLOY_KEYS) {
  ALLOWED_EXCHANGES[key] = [...CRYPTO_PERP_EXCHANGES];
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Parse body
    const body = await req.json();
    const useExistingCredentials = body.useExistingCredentials === true;
    const { bot, exchange, credentials } = body as {
      bot?: string;
      exchange?: string;
      credentials?: Record<string, string>;
      useExistingCredentials?: boolean;
      riskPerTrade?: unknown;
      maxConcurrentTrades?: unknown;
      dailyLossLimit?: unknown;
    };

    if (!bot || !exchange) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!useExistingCredentials && (!credentials?.apiKey || !credentials?.apiSecret)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const prefsInput = validateTradingPrefsUpdate({
      riskPerTrade: body.riskPerTrade ?? DEFAULT_TRADING_PREFS.riskPerTrade,
      maxConcurrentTrades:
        body.maxConcurrentTrades ?? DEFAULT_TRADING_PREFS.maxConcurrentTrades,
      dailyLossLimit: body.dailyLossLimit ?? DEFAULT_TRADING_PREFS.dailyLossLimit,
    });
    if (!prefsInput.ok) {
      return NextResponse.json({ error: prefsInput.error }, { status: 400 });
    }

    if (!ALLOWED_BOTS.has(bot)) {
      return NextResponse.json({ error: "Invalid bot" }, { status: 400 });
    }

    // Apply per-bot bounds. The Crypto Bot floor (3) means a deploy
    // request that omits maxConcurrentTrades — falling back to the
    // legacy platform default of 1 — gets snapped up to 3 here, both
    // on the new deployment doc and on the mirrored secrets write
    // below. No other bots are constrained today.
    const tradingPrefs = {
      ...DEFAULT_TRADING_PREFS,
      ...prefsInput.updates,
      maxConcurrentTrades: clampMaxConcurrentForBot(
        bot,
        prefsInput.updates.maxConcurrentTrades ??
          DEFAULT_TRADING_PREFS.maxConcurrentTrades,
      ),
    };

    const allowedExchanges = ALLOWED_EXCHANGES[bot] ?? [];
    if (!allowedExchanges.includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange for this bot" }, { status: 400 });
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const db = getAdminFirestore();
    const exchangeName = exchange as ExchangeName;

    let apiKey = credentials?.apiKey ?? "";
    let apiSecret = credentials?.apiSecret ?? "";
    let existingSecretRef: FirebaseFirestore.DocumentReference | null = null;

    if (useExistingCredentials) {
      const loaded = await loadUserExchangeSecret(db, uid, exchangeName);
      if (!loaded) {
        return NextResponse.json(
          { error: "No saved API keys for this exchange. Enter new credentials to continue." },
          { status: 400 },
        );
      }
      apiKey = loaded.creds.apiKey;
      apiSecret = loaded.creds.apiSecret;
      existingSecretRef = loaded.ref;
    }

    const keyFingerprint = computeFingerprint(exchange, apiKey, encryptionKey);

    // ── Block duplicate active deployment for same bot × exchange ─────────────
    const existingActiveSnap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .where("exchange", "==", exchange)
      .where("bot", "==", bot)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!existingActiveSnap.empty) {
      return NextResponse.json(
        { error: "You already have this bot running on this exchange." },
        { status: 409 },
      );
    }

    // ── Check if a *different* user already owns this exact API key ────────────
    const duplicateSnap = await db
      .collection("bot_deployments")
      .where("exchange", "==", exchange)
      .where("keyFingerprint", "==", keyFingerprint)
      .limit(1)
      .get();

    if (!duplicateSnap.empty && duplicateSnap.docs[0].data().uid !== uid) {
      return NextResponse.json(
        { error: "This API key is already registered on FreedomBot. Each exchange account can only be linked once." },
        { status: 409 },
      );
    }

    // ── Validate API keys by calling the exchange ─────────────────────────────
    const liveCreds: ExchangeCredentials = {
      apiKey,
      apiSecret,
      testnet: false,
    };

    let exchangeUid: string | null = null;
    // Reuse the validation balance below to seed the deployment's wallet
    // snapshot — saves an extra venue round-trip on the deploy POST.
    let validatedBalance: { total: number; available: number } | null = null;
    try {
      const connector = getConnector(exchange);
      const balance = await connector.getUsdtBalance(liveCreds);
      if (balance.total < 0) throw new Error("Unexpected negative balance");
      validatedBalance = { total: balance.total, available: balance.available };
      if (exchange === "HYPERLIQUID" && balance.total <= 0) {
        const describe =
          "describeZeroPerpBalance" in connector
            ? (connector as { describeZeroPerpBalance: (c: ExchangeCredentials) => Promise<string> })
                .describeZeroPerpBalance
            : null;
        throw new Error(
          describe
            ? await describe(liveCreds)
            : "No USDC in your Hyperliquid perps account. Deposit or transfer USDC to perps on app.hyperliquid.xyz before deploying.",
        );
      }

      // Fetch the stable exchange account UID (Bybit userID survives key rotation)
      const connectorWithUid = connector as {
        getAccountUid?: (c: ExchangeCredentials) => Promise<string | null>;
      };
      if (connectorWithUid.getAccountUid) {
        exchangeUid = await connectorWithUid.getAccountUid(liveCreds);
      }
    } catch (e) {
      return NextResponse.json(
        {
          error: `Could not verify your ${exchange} API keys: ${e instanceof Error ? e.message : String(e)}. Please check they are correct and have futures trading permissions enabled.`,
        },
        { status: 400 },
      );
    }

    // ── Block if another user's active deployment already uses this exchange account ─
    if (exchangeUid) {
      const uidDuplicateSnap = await db
        .collection("bot_deployments")
        .where("exchange", "==", exchange)
        .where("exchangeUid", "==", exchangeUid)
        .where("status", "==", "active")
        .limit(2)
        .get();

      const otherOwner = uidDuplicateSnap.docs.find((d) => d.data().uid !== uid);
      if (otherOwner) {
        return NextResponse.json(
          {
            error:
              "This exchange account is already linked to an active FreedomBot deployment. Each account can only run one bot at a time. Stop the existing deployment first.",
          },
          { status: 409 },
        );
      }
    }

    // ── Ensure the parent `users/{uid}` doc exists ────────────────────────────
    // Writing to a subcollection (`users/{uid}/secrets/...`) does NOT create
    // the parent document in Firestore — it becomes a "missing" doc that
    // `collection("users").get()` will silently skip. The live-execution
    // path historically iterated `users` with `.get()`, so FreedomBot-only
    // users (who never went through the TezTerminal subscription flow that
    // writes the parent doc) were invisible to the signal dispatcher and
    // their bots never traded. We now also use a collection-group query in
    // `live-execution`, but writing the parent doc here is cheap belt-and-
    // braces insurance for anything else that scans `users`.
    await db.collection("users").doc(uid).set(
      {
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
        lastSeenAt: new Date().toISOString(),
        freedombotDeployedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    // ── Write credentials into the trading engine's secrets collection ─────────
    const docId = getSecretDocId(exchangeName);
    const secretRef =
      existingSecretRef ?? db.collection("users").doc(uid).collection("secrets").doc(docId);

    if (!useExistingCredentials) {
      await secretRef.set({
        exchange,
        encryptedKey: encrypt(apiKey),
        encryptedSecret: encrypt(apiSecret),
        keyLastFour: apiKey.slice(-4),
        autoTradeEnabled: true,
        riskPerTrade: tradingPrefs.riskPerTrade,
        maxConcurrentTrades: tradingPrefs.maxConcurrentTrades,
        dailyLossLimit: tradingPrefs.dailyLossLimit,
        useTestnet: false,
        savedAt: new Date().toISOString(),
      });
    } else {
      await secretRef.set(
        {
          autoTradeEnabled: true,
          riskPerTrade: tradingPrefs.riskPerTrade,
          maxConcurrentTrades: tradingPrefs.maxConcurrentTrades,
          dailyLossLimit: tradingPrefs.dailyLossLimit,
          savedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    const zoneField = zoneFieldFromDeployKey(bot);
    if (zoneField) {
      await secretRef.update({
        [zoneBotsEnabledFieldKey(zoneField)]: true,
      });
    }

    // ── Re-activate paused deployment (same bot × exchange) instead of duplicating ─
    const siblingSnap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .where("exchange", "==", exchange)
      .where("bot", "==", bot)
      .get();

    const pausedDocs = siblingSnap.docs
      .filter((d) => {
        const s = String(d.data().status ?? "").toLowerCase();
        return s === "paused" || s === "stopped";
      })
      .sort((a, b) => {
        const aMs = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bMs = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bMs - aMs;
      });

    if (pausedDocs.length > 0) {
      const deployRef = pausedDocs[0].ref;
      // Per-deployment cap lives on the deployment doc itself (was the
      // secrets doc historically — see `deployment-cap.ts`). We always
      // persist the user-submitted prefs on resume so an updated
      // BotSettings change carries through, and we tag the doc as
      // `user_deploy` so the public dashboard surfaces it.
      await deployRef.update({
        status: "active",
        resumedAt: new Date().toISOString(),
        pausedAt: null,
        keyFingerprint,
        keyLastFour: apiKey.slice(-4),
        ...(exchangeUid ? { exchangeUid } : {}),
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        tradingPrefs,
        source: "user_deploy",
      });

      if (validatedBalance) {
        await persistWalletBalanceSnapshot(
          deployRef,
          exchangeName,
          {
            ok: true,
            total: validatedBalance.total,
            available: validatedBalance.available,
          },
          db,
        );
      }

      return NextResponse.json({
        success: true,
        deploymentId: deployRef.id,
        resumed: true,
      });
    }

    // ── Create new deployment record ──────────────────────────────────────────
    // `tradingPrefs` and `source` are the per-deployment fields that
    // replaced the legacy `secrets.{maxConcurrentTrades,riskPerTrade,
    // dailyLossLimit}` model. See `src/lib/freedombot/deployment-cap.ts`
    // for the read fallback chain and why they live here.
    const docRef = await db.collection("bot_deployments").add({
      uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      bot,
      exchange,
      keyFingerprint,
      keyLastFour: apiKey.slice(-4),
      ...(exchangeUid ? { exchangeUid } : {}),
      status: "active",
      createdAt: new Date(),
      tradingPrefs,
      source: "user_deploy",
    });
    const deploymentId = docRef.id;
    const deployedAt = new Date().toISOString();

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.data()?.freedombotFirstBot) {
      await userRef.set(
        {
          freedombotFirstBot: {
            bot,
            exchange,
            deployedAt,
          },
        },
        { merge: true },
      );
    }

    // ── Seed wallet snapshot from the balance we fetched during validation ────
    // Lets the admin dashboard show the live wallet balance the moment the
    // deployment appears, without waiting for the next cron tick.
    if (validatedBalance) {
      await persistWalletBalanceSnapshot(
        docRef,
        exchange as ExchangeName,
        {
          ok: true,
          total: validatedBalance.total,
          available: validatedBalance.available,
        },
        db,
      );
    }

    return NextResponse.json({ success: true, deploymentId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
