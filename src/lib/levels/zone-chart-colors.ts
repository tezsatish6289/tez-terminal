/**
 * Single palette for levels chart bands, price lines, and bubble map.
 * Matches NativeCandlesChart baseline fills + ZonePriceLadder zone bands.
 */
export const LEVELS_ZONE_CHART = {
  bull: {
    line: "#22c55e",
    lineInv: "#4ade80",
    bandFill: "rgba(34, 197, 94, 0.35)",
    bandFillSoft: "rgba(34, 197, 94, 0.12)",
    bandBorder: "rgba(74, 222, 128, 0.5)",
    bandBorderSolid: "#4ade80",
    bandGlow: "0 0 24px rgba(34, 197, 94, 0.15)",
    labelText: "#86efac",
    labelTextMuted: "#6ee7b7",
    badgeText: "#86efac",
    badgeBg: "rgba(34, 197, 94, 0.14)",
    nativeBandTop: "rgba(34, 197, 94, 0.38)",
    nativeBandBottom: "rgba(34, 197, 94, 0.14)",
  },
  bear: {
    line: "#ef4444",
    lineInv: "#f87171",
    bandFill: "rgba(239, 68, 68, 0.35)",
    bandFillSoft: "rgba(239, 68, 68, 0.12)",
    bandBorder: "rgba(248, 113, 113, 0.5)",
    bandBorderSolid: "#f87171",
    bandGlow: "0 0 24px rgba(239, 68, 68, 0.15)",
    labelText: "#fca5a5",
    labelTextMuted: "#fecaca",
    badgeText: "#fca5a5",
    badgeBg: "rgba(239, 68, 68, 0.14)",
    nativeBandTop: "rgba(239, 68, 68, 0.38)",
    nativeBandBottom: "rgba(239, 68, 68, 0.14)",
  },
  /** Max pain — yellow reserved for this level only. */
  maxPain: {
    line: "#fbbf24",
    labelText: "#fbbf24",
  },
} as const;
