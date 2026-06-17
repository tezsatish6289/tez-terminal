import { isNseExpiryExpired } from "@/lib/levels/zones-expiry-label";

/** Drop expired labels; preserve NSE order (nearest active first). */
export function filterActiveNseExpiries(labels: readonly string[], nowMs = Date.now()): string[] {
  return labels.filter((l) => !isNseExpiryExpired(l, nowMs));
}

export { isNseExpiryExpired, nseExpiryIstDateKey } from "@/lib/levels/zones-expiry-label";
