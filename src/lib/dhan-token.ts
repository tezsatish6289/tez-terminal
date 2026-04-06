/**
 * Dhan system-level token manager.
 *
 * Dhan access tokens expire every 24 hours (SEBI regulation).
 * This module stores the token in Firestore and auto-renews it before expiry.
 *
 * Auto-renewal strategy (in priority order):
 *   1. POST /v2/RenewToken  — fast, works while token is still active
 *   2. TOTP generation       — fully automatic if DHAN_TOTP_SECRET + DHAN_PIN env vars are set
 *
 * Manual fallback (when both fail / token already expired):
 *   - Generate a new token from web.dhan.co → Profile → Access DhanHQ APIs
 *   - POST /api/admin/dhan-token  { accessToken, clientId }  to reseed Firestore
 *
 * Flow:
 *   1. sync-prices cron calls ensureValidToken() every run
 *   2. If token age < 8h AND not expired → return as-is
 *   3. If token age ≥ 8h and token is still active → RenewToken
 *   4. If token expired or RenewToken failed → try TOTP generation
 *   5. If everything fails → return null (caller logs the error)
 */

import { createHmac } from "crypto";
import { getAdminFirestore } from "@/firebase/admin";
import type { ExchangeCredentials } from "./exchanges/types";

const FIRESTORE_DOC = "config/dhan_system_token";
const RENEW_AFTER_MS = 8 * 60 * 60 * 1000; // 8 hours — 3 renewal windows per 24h

interface DhanTokenDoc {
  accessToken: string;
  clientId: string;
  issuedAt: string;
  renewedAt: string;
  renewCount: number;
}

// ── JWT expiry helpers ────────────────────────────────────────────

function getJwtExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  const exp = getJwtExpiry(token);
  return exp != null && Date.now() >= exp;
}

// ── TOTP generation (RFC 6238, SHA-1) ─────────────────────────────
// No external dependencies — uses Node's built-in crypto module.
// Requires DHAN_TOTP_SECRET (base32) + DHAN_PIN env vars.

function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of encoded.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "")) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

function generateTOTP(secret: string, step = 30): string {
  const time = Math.floor(Date.now() / 1000 / step);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeUInt32BE(0, 0);
  timeBuf.writeUInt32BE(time, 4);
  const key = base32Decode(secret);
  const hmac = createHmac("sha1", key).update(timeBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

// ── Internal helpers ──────────────────────────────────────────────

async function persistToken(
  db: FirebaseFirestore.Firestore,
  existing: DhanTokenDoc | null,
  newToken: string,
  source: string
) {
  const now = new Date().toISOString();
  const clientId = existing?.clientId ?? process.env.DHAN_CLIENT_ID ?? "";
  await db.doc(FIRESTORE_DOC).set({
    accessToken: newToken,
    clientId,
    issuedAt: existing?.issuedAt ?? now,
    renewedAt: now,
    renewCount: (existing?.renewCount ?? 0) + 1,
  });
  console.log(
    `[DhanToken] Token saved via ${source} (total renewals: ${(existing?.renewCount ?? 0) + 1})`
  );
}

/**
 * Strategy 1: POST /v2/RenewToken
 * Works only while the token is still active (not yet expired).
 * Dhan expires the old token and issues a new 24h token.
 *
 * Note: the correct header is "dhanClientId", NOT "client-id".
 */
async function tryRenewToken(currentToken: string, clientId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8_000);
    const res = await fetch("https://api.dhan.co/v2/RenewToken", {
      method: "POST",
      headers: {
        "access-token": currentToken,
        "dhanClientId": clientId, // ← must be "dhanClientId", not "client-id"
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[DhanToken] RenewToken failed (${res.status}): ${text}`);
      return null;
    }
    const result = await res.json();
    const token = result.accessToken ?? result.access_token ?? result.token;
    if (!token) {
      console.error("[DhanToken] RenewToken response missing token:", JSON.stringify(result));
    }
    return token ?? null;
  } catch (err) {
    console.error("[DhanToken] RenewToken error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generates a fresh 24h Dhan access token using TOTP + PIN for ANY user.
 * Called by the live-trades cron per-user with their own stored credentials.
 *
 * Also used internally as Strategy 2 for the system token (from env vars).
 */
export async function generateTokenForUser(
  clientId: string,
  totpSecret: string,
  pin: string
): Promise<string | null> {
  try {
    const totp = generateTOTP(totpSecret);
    const url =
      `https://auth.dhan.co/app/generateAccessToken` +
      `?dhanClientId=${encodeURIComponent(clientId)}` +
      `&pin=${encodeURIComponent(pin)}` +
      `&totp=${totp}`;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { method: "POST", signal: controller.signal });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[DhanToken] TOTP generation failed for ${clientId} (${res.status}): ${text}`);
      return null;
    }
    const result = await res.json();
    const token = result.accessToken ?? result.access_token;
    if (token) {
      console.log(`[DhanToken] Fresh token generated via TOTP for client ${clientId}`);
    } else {
      console.error("[DhanToken] TOTP response missing accessToken:", JSON.stringify(result));
    }
    return token ?? null;
  } catch (err) {
    console.error("[DhanToken] TOTP generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** @internal system-token strategy 2 wrapper (reads from env vars) */
async function tryTOTPGeneration(clientId: string): Promise<string | null> {
  const totpSecret = process.env.DHAN_TOTP_SECRET;
  const pin = process.env.DHAN_PIN;

  if (!totpSecret || !pin) {
    console.warn(
      "[DhanToken] TOTP fallback not configured. " +
        "Set DHAN_TOTP_SECRET + DHAN_PIN env vars for fully-automatic daily renewal."
    );
    return null;
  }

  return generateTokenForUser(clientId, totpSecret, pin);
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Returns the current Dhan credentials from Firestore (no renewal attempt).
 */
export async function getSystemDhanCreds(): Promise<ExchangeCredentials | null> {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
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
 * Ensures a valid, non-expired Dhan token is available.
 * Tries renewal → TOTP generation before giving up.
 * Returns null if no valid token can be obtained.
 */
export async function ensureValidToken(): Promise<ExchangeCredentials | null> {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  // ── Bootstrap from env if Firestore doc doesn't exist ──────────
  if (!doc.exists) {
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
      console.log("[DhanToken] Bootstrapped token from env vars");
      return { apiKey: envToken, apiSecret: envClientId };
    }
    console.error(
      "[DhanToken] No token configured. Seed one via POST /api/admin/dhan-token " +
        "or set DHAN_ACCESS_TOKEN + DHAN_CLIENT_ID env vars."
    );
    return null;
  }

  const data = doc.data() as DhanTokenDoc;
  const ageMs = Date.now() - new Date(data.renewedAt).getTime();
  const tokenExpired = isJwtExpired(data.accessToken);
  const needsRenewal = tokenExpired || ageMs >= RENEW_AFTER_MS;

  // Token is fresh and valid — return immediately
  if (!needsRenewal) {
    return { apiKey: data.accessToken, apiSecret: data.clientId };
  }

  const ageH = (ageMs / 3_600_000).toFixed(1);
  console.log(
    `[DhanToken] Token needs renewal (age=${ageH}h, expired=${tokenExpired}). Trying strategies...`
  );

  // ── Strategy 1: RenewToken (only if token is still active) ─────
  if (!tokenExpired) {
    const renewed = await tryRenewToken(data.accessToken, data.clientId);
    if (renewed) {
      await persistToken(db, data, renewed, "RenewToken");
      return { apiKey: renewed, apiSecret: data.clientId };
    }
  }

  // ── Strategy 2: TOTP-based fresh generation ─────────────────────
  const fresh = await tryTOTPGeneration(data.clientId);
  if (fresh) {
    await persistToken(db, data, fresh, "TOTP");
    return { apiKey: fresh, apiSecret: data.clientId };
  }

  // ── All strategies exhausted ─────────────────────────────────────
  if (tokenExpired) {
    // Last resort: reseed from env var if it holds a newer valid token
    const envToken = process.env.DHAN_ACCESS_TOKEN;
    const envClientId = process.env.DHAN_CLIENT_ID;
    if (envToken && envToken !== data.accessToken && !isJwtExpired(envToken)) {
      console.log("[DhanToken] Reseeding from DHAN_ACCESS_TOKEN env var (newer valid token found)");
      await persistToken(db, data, envToken, "env-reseed");
      return { apiKey: envToken, apiSecret: envClientId ?? data.clientId };
    }

    console.error(
      "[DhanToken] ❌ Token expired and all auto-renewal strategies failed.\n" +
        "Fix options:\n" +
        "  A) Go to web.dhan.co → Profile → Access DhanHQ APIs → Generate Access Token (24h)\n" +
        "     Then POST /api/admin/dhan-token with { accessToken, clientId } to reseed.\n" +
        "  B) Set DHAN_TOTP_SECRET + DHAN_PIN env vars for fully-automatic renewal.\n" +
        "     (Setup TOTP at web.dhan.co → Profile → Access DhanHQ APIs → Setup TOTP)"
    );
    return null;
  }

  // Token is still technically valid — use it even though renewal failed
  console.warn("[DhanToken] Renewal failed but token not yet expired — using current token.");
  return { apiKey: data.accessToken, apiSecret: data.clientId };
}
