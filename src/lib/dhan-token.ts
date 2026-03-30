/**
 * Dhan system-level token manager.
 *
 * Dhan access tokens expire every 24 hours (SEBI regulation).
 * This module stores the token in Firestore and auto-renews it
 * via Dhan's /v2/RenewToken endpoint before it lapses.
 *
 * Flow:
 *   1. User seeds the first token via the admin UI or env var
 *   2. sync-prices cron calls ensureValidToken() every run
 *   3. If token is >20h old → call /v2/RenewToken → save new token
 *   4. All Dhan price/data operations use getSystemDhanCreds()
 */

import { getAdminFirestore } from "@/firebase/admin";
import type { ExchangeCredentials } from "./exchanges/types";

const FIRESTORE_DOC = "config/dhan_system_token";
const RENEW_AFTER_MS = 8 * 60 * 60 * 1000; // 8 hours — gives 3 renewal attempts per 24h window

interface DhanTokenDoc {
  accessToken: string;
  clientId: string;
  issuedAt: string;
  renewedAt: string;
  renewCount: number;
}

/**
 * Get the current system-level Dhan credentials.
 * Returns null if no token is configured.
 */
export async function getSystemDhanCreds(): Promise<ExchangeCredentials | null> {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
    // Fallback: bootstrap from env vars on first run
    const envToken = process.env.DHAN_ACCESS_TOKEN;
    const envClientId = process.env.DHAN_CLIENT_ID;
    if (envToken && envClientId) {
      const now = new Date().toISOString();
      await db.doc(FIRESTORE_DOC).set({
        accessToken: envToken,
        clientId: envClientId,
        issuedAt: now,
        renewedAt: now,
        renewCount: 0,
      });
      return { apiKey: envToken, apiSecret: envClientId };
    }
    return null;
  }

  const data = doc.data() as DhanTokenDoc;
  return { apiKey: data.accessToken, apiSecret: data.clientId };
}

/**
 * Check token age and renew if older than 20 hours.
 * Returns the (possibly renewed) credentials, or null if unavailable.
 */
export async function ensureValidToken(): Promise<ExchangeCredentials | null> {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
    // Try bootstrap from env
    const envToken = process.env.DHAN_ACCESS_TOKEN;
    const envClientId = process.env.DHAN_CLIENT_ID;
    if (envToken && envClientId) {
      const now = new Date().toISOString();
      await db.doc(FIRESTORE_DOC).set({
        accessToken: envToken,
        clientId: envClientId,
        issuedAt: now,
        renewedAt: now,
        renewCount: 0,
      });
      return { apiKey: envToken, apiSecret: envClientId };
    }
    return null;
  }

  const data = doc.data() as DhanTokenDoc;
  const renewedAt = new Date(data.renewedAt).getTime();
  const age = Date.now() - renewedAt;

  if (age < RENEW_AFTER_MS) {
    return { apiKey: data.accessToken, apiSecret: data.clientId };
  }

  // Token is stale — renew it
  console.log(`[DhanToken] Token is ${(age / 3600000).toFixed(1)}h old, renewing...`);

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);

    const res = await fetch("https://api.dhan.co/v2/RenewToken", {
      method: "POST",
      headers: {
        "access-token": data.accessToken,
        "client-id": data.clientId,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[DhanToken] Renewal failed (${res.status}): ${text}`);
      // Return current token — it might still work within the 24h window
      return { apiKey: data.accessToken, apiSecret: data.clientId };
    }

    const result = await res.json();
    const newToken = result.accessToken ?? result.access_token ?? result.token;

    if (!newToken) {
      console.error("[DhanToken] Renewal response missing token:", JSON.stringify(result));
      return { apiKey: data.accessToken, apiSecret: data.clientId };
    }

    const now = new Date().toISOString();
    await db.doc(FIRESTORE_DOC).set({
      accessToken: newToken,
      clientId: data.clientId,
      issuedAt: data.issuedAt,
      renewedAt: now,
      renewCount: (data.renewCount ?? 0) + 1,
    });

    console.log(`[DhanToken] Renewed successfully (count: ${(data.renewCount ?? 0) + 1})`);
    return { apiKey: newToken, apiSecret: data.clientId };
  } catch (err) {
    console.error("[DhanToken] Renewal error:", err instanceof Error ? err.message : err);
    return { apiKey: data.accessToken, apiSecret: data.clientId };
  }
}
