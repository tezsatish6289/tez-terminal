import "server-only";

import { decrypt, encrypt } from "@/lib/crypto";

/** Normalise to a valid 10-digit Indian mobile (6-9 leading), else null. */
export function normalizeIndianMobile(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** Encrypt a normalised mobile for at-rest storage (AES-256-GCM, base64). */
export function encryptPhone(phone: string): string {
  return encrypt(phone);
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

/** Masks a mobile for display, e.g. "9876543210" → "98••••3210". */
export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 6) return phone;
  return `${phone.slice(0, 2)}••••${phone.slice(-4)}`;
}
