#!/usr/bin/env node
/**
 * Local Dhan TOTP smoke test (no Firestore write).
 *
 * Requires in .env.local or shell:
 *   DHAN_CLIENT_ID, DHAN_TOTP_SECRET (base32), DHAN_PIN
 *
 * Usage:
 *   node --env-file=.env.local scripts/dhan-totp-test.mjs
 */

import { createHmac } from "crypto";
import { readFileSync, existsSync } from "fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(".env.local");

function base32Decode(encoded) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
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

function totpForOffset(secret, offsetSec, step = 30) {
  const time = Math.floor((Date.now() / 1000 + offsetSec) / step);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeUInt32BE(0, 0);
  timeBuf.writeUInt32BE(time, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(timeBuf).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[o] & 0x7f) << 24) |
    ((hmac[o + 1] & 0xff) << 16) |
    ((hmac[o + 2] & 0xff) << 8) |
    (hmac[o + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

const clientId = process.env.DHAN_CLIENT_ID?.trim();
const secret = process.env.DHAN_TOTP_SECRET?.trim();
const pin = process.env.DHAN_PIN?.trim();

if (!clientId || !secret || !pin) {
  console.error("Missing DHAN_CLIENT_ID, DHAN_TOTP_SECRET, or DHAN_PIN");
  process.exit(1);
}

console.log("Client:", clientId);
console.log("TOTP secret length:", secret.replace(/\s/g, "").length, "chars");

for (const offset of [0, -30, 30]) {
  const totp = totpForOffset(secret, offset);
  const url =
    `https://auth.dhan.co/app/generateAccessToken` +
    `?dhanClientId=${encodeURIComponent(clientId)}` +
    `&pin=${encodeURIComponent(pin)}` +
    `&totp=${totp}`;

  process.stdout.write(`Trying offset ${offset}s… `);
  const res = await fetch(url, { method: "POST" });
  const text = await res.text();
  if (!res.ok) {
    console.log(`FAIL ${res.status}: ${text.slice(0, 200)}`);
    if (/too many attempts/i.test(text)) {
      console.error("\nDhan rate-limited this client. Wait 15–30 minutes before retrying (one POST only).");
      process.exit(2);
    }
    continue;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log("FAIL: non-JSON response");
    continue;
  }
  const token = json.accessToken ?? json.access_token;
  if (token) {
    console.log("OK — got access token");
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (payload.exp) console.log("JWT expires:", new Date(payload.exp * 1000).toISOString());
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
  console.log("FAIL: no token in response:", text.slice(0, 200));
}

console.error("\nAll TOTP windows failed. Check PIN, secret (base32 from Dhan), and TOTP enabled on account.");
process.exit(1);
