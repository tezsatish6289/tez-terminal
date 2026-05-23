import { createHash, timingSafeEqual } from "node:crypto";

const ENV_KEY = "PUBLIC_LIVE_PASSPHRASE";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True when `PUBLIC_LIVE_PASSPHRASE` is set in the environment. */
export function publicLivePassphraseConfigured(): boolean {
  return Boolean(process.env[ENV_KEY]?.trim());
}

/**
 * Constant-time compare of the operator passphrase against
 * `PUBLIC_LIVE_PASSPHRASE`. Returns false when env is unset.
 */
export function verifyPublicLivePassphrase(candidate: string): boolean {
  const expected = process.env[ENV_KEY]?.trim();
  if (!expected || !candidate.trim()) return false;

  const a = digest(candidate.trim());
  const b = digest(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
