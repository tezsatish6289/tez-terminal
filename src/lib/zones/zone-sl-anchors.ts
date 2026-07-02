/** Resolve half-width for SL anchoring — prefer suggester field, else infer
 *  from symmetric band geometry on legacy Firestore docs. */
export function resolveZoneHalfWidthUsd(input: {
  halfWidthUsd?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
}): number | null {
  const { halfWidthUsd, bullZoneLow, bullZoneHigh, bearZoneLow, bearZoneHigh } =
    input;
  if (
    halfWidthUsd != null &&
    Number.isFinite(halfWidthUsd) &&
    halfWidthUsd > 0
  ) {
    return halfWidthUsd;
  }
  if (bullZoneLow != null && bullZoneHigh != null) {
    const w = (bullZoneHigh - bullZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) return w;
  }
  if (bearZoneLow != null && bearZoneHigh != null) {
    const w = (bearZoneHigh - bearZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) return w;
  }
  return null;
}

/** SL anchors one half-width outside the zone band. */
export function computeZoneSlAnchors(input: {
  halfWidthUsd?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
}): { bullSl: number | null; bearSl: number | null; halfWidthUsd: number | null } {
  const half = resolveZoneHalfWidthUsd(input);
  if (half == null) {
    return { bullSl: null, bearSl: null, halfWidthUsd: null };
  }
  const bullSl =
    input.bullZoneLow != null && Number.isFinite(input.bullZoneLow)
      ? input.bullZoneLow - half
      : null;
  const bearSl =
    input.bearZoneHigh != null && Number.isFinite(input.bearZoneHigh)
      ? input.bearZoneHigh + half
      : null;
  return { bullSl, bearSl, halfWidthUsd: half };
}
