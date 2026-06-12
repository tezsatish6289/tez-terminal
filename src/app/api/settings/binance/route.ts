import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  getConnector,
  fetchExchangeWalletBalance,
  isExchangeSupported,
  getSecretDocId,
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";
import { generateTokenForUser } from "@/lib/dhan-token";

/**
 * Exchange credentials management.
 *
 * Supports multiple exchanges via the `exchange` parameter.
 * Credentials are stored at: users/{uid}/secrets/{docId}
 *   - BYBIT   → secrets/bybit   (fallback: legacy secrets/binance)
 *   - BINANCE → secrets/binance_futures
 *   - MEXC    → secrets/mexc
 *   - COINDCX → secrets/coindcx
 *   - HYPERLIQUID → secrets/hyperliquid
 *
 * GET    — check if credentials are saved + auto-trade status
 * POST   — save (encrypted) API key + secret
 * PUT    — update auto-trade config (toggle, risk, max trades, etc.)
 * DELETE — remove credentials for an exchange
 */

function resolveExchangeName(param: string | null | undefined): ExchangeName {
  const raw = (param || "BYBIT").toUpperCase();
  if (!isExchangeSupported(raw)) return "BYBIT";
  return raw as ExchangeName;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(searchParams.get("exchange"));
  const db = getAdminFirestore();

  const docIds = getSecretDocIds(exchangeName);
  let data: Record<string, unknown> | null = null;

  for (const id of docIds) {
    const doc = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
    if (doc.exists) {
      const docData = doc.data()!;
      if (docMatchesExchange(docData, exchangeName, id)) {
        data = docData;
        break;
      }
    }
  }

  if (!data) {
    return NextResponse.json({ configured: false, autoTradeEnabled: false, exchange: exchangeName });
  }

  return NextResponse.json({
    configured: true,
    exchange: exchangeName,
    autoTradeEnabled: data.autoTradeEnabled ?? false,
    keyLastFour: data.keyLastFour ?? "****",
    riskPerTrade: data.riskPerTrade ?? 1,
    maxConcurrentTrades: data.maxConcurrentTrades ?? 5,
    dailyLossLimit: data.dailyLossLimit ?? 3,
    useTestnet: data.useTestnet ?? true,
    savedAt: data.savedAt ?? null,
    // Per-bot opt-in map for zone bots (default false). Pattern-bot
    // mirroring is governed by autoTradeEnabled alone — these flags are
    // ADDITIONAL gates that only apply when the cron passes a non-
    // PATTERN botSource into executeForAllUsers.
    zoneBotsEnabled: data.zoneBotsEnabled ?? {},
    // Dhan-specific: indicate TOTP is configured (without exposing secrets)
    totpConfigured: exchangeName === "DHAN" ? !!(data.encryptedSecret && data.encryptedPin) : undefined,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, apiKey, apiSecret } = body;

    if (!uid || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing uid, apiKey, or apiSecret" }, { status: 400 });
    }

    const exchangeName = resolveExchangeName(body.exchange);
    const useTestnet = body.useTestnet === true;
    const docId = getSecretDocId(exchangeName);
    const db = getAdminFirestore();

    // Risk parameters are owned by the UI. On every save (first-time AND
    // re-save) we take whatever the client sends — only valid, positive
    // numbers are accepted; anything missing/invalid is ignored so re-saving
    // keys never resets a configured value. First-time setup falls back to
    // platform defaults for any field the client didn't provide.
    const uiPrefs: Record<string, number> = {};
    const riskPerTradeIn = Number(body.riskPerTrade);
    const maxConcurrentTradesIn = Number(body.maxConcurrentTrades);
    const dailyLossLimitIn = Number(body.dailyLossLimit);
    if (Number.isFinite(riskPerTradeIn) && riskPerTradeIn > 0) uiPrefs.riskPerTrade = riskPerTradeIn;
    if (Number.isFinite(maxConcurrentTradesIn) && maxConcurrentTradesIn > 0) uiPrefs.maxConcurrentTrades = maxConcurrentTradesIn;
    if (Number.isFinite(dailyLossLimitIn) && dailyLossLimitIn > 0) uiPrefs.dailyLossLimit = dailyLossLimitIn;

    if (exchangeName === "DHAN") {
      // Dhan: apiKey = Client ID, apiSecret = TOTP secret, body.pin = login PIN
      const pin = body.pin as string | undefined;
      if (!pin) {
        return NextResponse.json({ error: "Missing Dhan login PIN" }, { status: 400 });
      }

      // Validate by generating a real token — confirms all 3 credentials are correct
      const { token: testToken, error: tokenError } = await generateTokenForUser(apiKey, apiSecret, pin);
      if (!testToken) {
        return NextResponse.json({
          error: `Dhan credential check failed: ${tokenError ?? "Could not generate token. Verify Client ID, TOTP Secret, and PIN."}`,
        }, { status: 400 });
      }

      const dhanRef = db.collection("users").doc(uid).collection("secrets").doc(docId);
      const dhanExisting = await dhanRef.get();
      // Credential fields are always (re)written; trading-config fields
      // (autoTradeEnabled, risk, caps, per-bot toggles) are written ONLY on
      // first setup. Re-saving keys must never silently reset a user's live
      // settings — see GET/PUT for how those are managed from the UI.
      const dhanCredentialFields = {
        exchange: "DHAN",
        encryptedKey: encrypt(apiKey),       // Client ID
        encryptedSecret: encrypt(apiSecret), // TOTP secret
        encryptedPin: encrypt(pin),          // Login PIN
        encryptedCachedToken: encrypt(testToken),
        cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        keyLastFour: apiKey.slice(-4),
        useTestnet: false,
        savedAt: new Date().toISOString(),
      };
      if (dhanExisting.exists) {
        // Update credentials + any risk params the UI sent; preserve the
        // live switch and any field the UI omitted.
        await dhanRef.set({ ...dhanCredentialFields, ...uiPrefs }, { merge: true });
      } else {
        await dhanRef.set({
          ...dhanCredentialFields,
          autoTradeEnabled: false,
          riskPerTrade: uiPrefs.riskPerTrade ?? 1,
          maxConcurrentTrades: uiPrefs.maxConcurrentTrades ?? 1,
          dailyLossLimit: uiPrefs.dailyLossLimit ?? 3,
        });
      }

      return NextResponse.json({ success: true, message: "Dhan credentials verified and saved. Token auto-renews daily." });
    }

    // ── Crypto exchanges: validate via balance check ──────────────
    try {
      const balance = await fetchExchangeWalletBalance(exchangeName, {
        apiKey,
        apiSecret,
        testnet: useTestnet,
      });
      if (balance.total < 0) throw new Error("Unexpected negative balance");
    } catch (e) {
      return NextResponse.json({
        error: `Invalid ${exchangeName} credentials for ${useTestnet ? "testnet" : "production"}: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 400 });
    }

    const secretRef = db.collection("users").doc(uid).collection("secrets").doc(docId);
    const existing = await secretRef.get();
    // Credential fields are always (re)written; trading-config fields
    // (autoTradeEnabled, risk, caps, per-bot toggles) are written ONLY on
    // first setup. Re-saving keys must NEVER silently reset live trading or a
    // user's risk/limits back to defaults — those are managed from the UI
    // (PUT here) and via deploy / pause / resume flows.
    const credentialFields = {
      exchange: exchangeName,
      encryptedKey: encrypt(apiKey),
      encryptedSecret: encrypt(apiSecret),
      keyLastFour: apiKey.slice(-4),
      useTestnet,
      savedAt: new Date().toISOString(),
    };
    if (existing.exists) {
      // Update credentials + any risk params the UI sent; preserve the live
      // switch and any field the UI omitted.
      await secretRef.set({ ...credentialFields, ...uiPrefs }, { merge: true });
    } else {
      await secretRef.set({
        ...credentialFields,
        autoTradeEnabled: false,
        riskPerTrade: uiPrefs.riskPerTrade ?? 1,
        maxConcurrentTrades: uiPrefs.maxConcurrentTrades ?? 1,
        dailyLossLimit: uiPrefs.dailyLossLimit ?? 3,
      });
    }

    return NextResponse.json({ success: true, message: `${exchangeName} credentials saved and validated.` });
  } catch (e) {
    console.error("[settings/exchange POST]", e);
    return NextResponse.json({
      error: `Server error: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { uid, ...updates } = body;

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(body.exchange);
  // Plain field names update the whole field; dotted-path keys
  // (e.g. "zoneBotsEnabled.btc") update one nested property without
  // clobbering siblings, so users can toggle one zone bot without
  // accidentally disabling others.
  const allowed = [
    "autoTradeEnabled",
    "riskPerTrade",
    "maxConcurrentTrades",
    "dailyLossLimit",
    "useTestnet",
    "zoneBotsEnabled.btc",
    "zoneBotsEnabled.eth",
    "zoneBotsEnabled.sol",
    "zoneBotsEnabled.xrp",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      // Coerce zoneBots flags to plain booleans defensively so a
      // misbehaving client can't write a truthy string ("false") that
      // would pass the gate.
      filtered[key] = key.startsWith("zoneBotsEnabled.") ? updates[key] === true : updates[key];
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const docIds = getSecretDocIds(exchangeName);
  let ref: FirebaseFirestore.DocumentReference | null = null;

  for (const id of docIds) {
    const docRef = db.collection("users").doc(uid).collection("secrets").doc(id);
    const doc = await docRef.get();
    if (doc.exists && docMatchesExchange(doc.data()!, exchangeName, id)) {
      ref = docRef;
      break;
    }
  }

  if (!ref) {
    return NextResponse.json({ error: `${exchangeName} credentials not configured yet` }, { status: 400 });
  }

  await ref.update(filtered);
  return NextResponse.json({ success: true, exchange: exchangeName, updated: Object.keys(filtered) });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(searchParams.get("exchange"));
  const db = getAdminFirestore();
  const docIds = getSecretDocIds(exchangeName);

  let deleted = false;
  for (const id of docIds) {
    const docRef = db.collection("users").doc(uid).collection("secrets").doc(id);
    const doc = await docRef.get();
    if (doc.exists && docMatchesExchange(doc.data()!, exchangeName, id)) {
      await docRef.delete();
      deleted = true;
      break;
    }
  }

  if (!deleted) {
    return NextResponse.json({ error: `No ${exchangeName} credentials found` }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: `${exchangeName} credentials deleted.` });
}
