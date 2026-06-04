#!/usr/bin/env node
/**
 * Print the current 6-digit TOTP for Dhan — does NOT call Dhan API.
 * Compare with Google Authenticator / Dhan app to verify DHAN_TOTP_SECRET before retrying auth.
 *
 *   node --env-file=.env.local scripts/dhan-totp-show-code.mjs
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

function totp(secret, step = 30) {
  const time = Math.floor(Date.now() / 1000 / step);
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

const secret = process.env.DHAN_TOTP_SECRET?.trim();
if (!secret) {
  console.error("Set DHAN_TOTP_SECRET in .env.local");
  process.exit(1);
}

const code = totp(secret);
const secsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`Current TOTP: ${code}  (refreshes in ${secsLeft}s)`);
console.log("Compare with the code in your authenticator app for Dhan.");
console.log("If they match, your secret is correct — wait for Dhan rate limit, then run ONE auth test.");
