/** Slideshow in-zone symbols: fresher support/resistance than the 15m default cache. */

/** Recompute zones when older than this while in slideshow view. */
export const SLIDESHOW_ZONE_STALE_MS = 5 * 60 * 1000;

/** How often to check the in-zone list for stale zone docs. */
export const SLIDESHOW_ZONE_TICK_MS = 2 * 60 * 1000;

export function isSlideshowZoneStale(computedAt: string | null | undefined): boolean {
  if (!computedAt) return true;
  const t = Date.parse(computedAt);
  return !Number.isFinite(t) || Date.now() - t >= SLIDESHOW_ZONE_STALE_MS;
}

export function formatZonesUpdatedAt(computedAt: string | null | undefined): string | null {
  if (!computedAt) return null;
  return new Date(computedAt).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function zonesUpdatedFooterLabel(
  computedAt: string | null | undefined,
): string | undefined {
  const when = formatZonesUpdatedAt(computedAt);
  return when ? `Support/resistance zones updated ${when}` : undefined;
}
