import "server-only";

import crypto from "crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  maskPhone,
  normalizeIndianMobile,
  toE164Indian,
} from "@/lib/phone-format";

export { maskPhone, normalizeIndianMobile, toE164Indian };

/** Encrypt a normalised mobile for at-rest storage (AES-256-GCM, base64). */
export function encryptPhone(phone: string): string {
  return encrypt(phone);
}

/**
 * Deterministic HMAC of a normalised Indian mobile for uniqueness indexes.
 * Not reversible; safe to store as a document ID.
 */
export function hashPhone(normalized10: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY env var must be at least 32 characters");
  }
  return crypto.createHmac("sha256", key).update(`fnoninja:phone:in:${normalized10}`).digest("hex");
}

/**
 * Reads the stored mobile off a user doc. Prefers the encrypted `phoneEnc`
 * field; falls back to a legacy plaintext `phone` field for older docs written
 * before field-level encryption. Returns null if absent/undecryptable.
 */
export function readStoredPhone(
  data: { phoneEnc?: unknown; phone?: unknown } | undefined | null,
): string | null {
  if (!data) return null;
  if (typeof data.phoneEnc === "string" && data.phoneEnc) {
    try {
      return decrypt(data.phoneEnc);
    } catch {
      return null;
    }
  }
  if (typeof data.phone === "string" && data.phone) {
    return normalizeIndianMobile(data.phone);
  }
  return null;
}

/** Parse E.164 / Firebase phone_number into a normalised Indian mobile. */
export function normalizeFromFirebasePhone(raw?: string | null): string | null {
  return normalizeIndianMobile(raw);
}
