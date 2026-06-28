import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import {
  bubbleTonePassesMinRR,
  deriveZoneStatus,
  nearestBandKind,
  type ZoneBands,
} from "@/lib/zones/zone-status";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";

/** Visual tone for the levels bubble map (splits generic NEAR by closest band). */
export type BubbleTone =
  | "IN_BULL"
  | "IN_BEAR"
  | "NEAR_BULL"
  | "NEAR_BEAR"
  | "NEUTRAL"
  | "ILLIQUID"
  | "UNSCANNED";

export interface BubbleToneStyle {
  /** Solid fill for in-zone; near-zone uses dark center + colored ring. */
  solid: boolean;
  fill: string;
  glow: string;
  border: string;
  borderStyle: "solid" | "dashed" | "dotted";
  borderWidth: number;
  label: string;
  /** Symbol/price text on the bubble (in-zone matches chart zone labels). */
  textColor: string;
  textMutedColor: string;
}

const { bull, bear } = LEVELS_ZONE_CHART;

/** Dark bubble center — zone status reads from the ring, not fill. */
const BUBBLE_CORE_FILL = "rgba(10, 14, 22, 0.92)";

export const BUBBLE_TONE_STYLE: Record<BubbleTone, BubbleToneStyle> = {
  IN_BULL: {
    solid: false,
    fill: BUBBLE_CORE_FILL,
    glow: "0 0 22px rgba(34, 197, 94, 0.35), inset 0 0 12px rgba(34, 197, 94, 0.08)",
    border: bull.bandBorderSolid,
    borderStyle: "solid",
    borderWidth: 4,
    label: "At Support",
    textColor: bull.labelText,
    textMutedColor: bull.labelTextMuted,
  },
  IN_BEAR: {
    solid: false,
    fill: BUBBLE_CORE_FILL,
    glow: "0 0 22px rgba(239, 68, 68, 0.35), inset 0 0 12px rgba(239, 68, 68, 0.08)",
    border: bear.bandBorderSolid,
    borderStyle: "solid",
    borderWidth: 4,
    label: "At Resistance",
    textColor: bear.labelText,
    textMutedColor: bear.labelTextMuted,
  },
  NEAR_BULL: {
    solid: false,
    fill: BUBBLE_CORE_FILL,
    glow: "0 0 14px rgba(34, 197, 94, 0.2)",
    border: bull.bandBorderSolid,
    borderStyle: "dotted",
    borderWidth: 3,
    label: "Near Support",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
  NEAR_BEAR: {
    solid: false,
    fill: BUBBLE_CORE_FILL,
    glow: "0 0 14px rgba(239, 68, 68, 0.2)",
    border: bear.bandBorderSolid,
    borderStyle: "dotted",
    borderWidth: 3,
    label: "Near Resistance",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
  NEUTRAL: {
    solid: false,
    fill: "rgba(30, 41, 59, 0.7)",
    glow: "none",
    border: "rgba(148, 163, 184, 0.5)",
    borderStyle: "solid",
    borderWidth: 1,
    label: "Scanned · between zones",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
  ILLIQUID: {
    solid: false,
    fill: "rgba(30, 41, 59, 0.75)",
    glow: "none",
    border: "rgba(100, 116, 139, 0.4)",
    borderStyle: "solid",
    borderWidth: 1,
    label: "Scanned · no bands",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
  UNSCANNED: {
    solid: false,
    fill: "rgba(51, 65, 85, 0.55)",
    glow: "none",
    border: "rgba(148, 163, 184, 0.45)",
    borderStyle: "dashed",
    borderWidth: 2,
    label: "Awaiting scan",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
};

export function deriveBubbleTone(bands: ZoneBands, scanned: boolean): BubbleTone {
  if (!scanned) return "UNSCANNED";

  const status = deriveZoneStatus(bands);
  if (status === "IN_BULL") return "IN_BULL";
  if (status === "IN_BEAR") return "IN_BEAR";
  if (status === "NEUTRAL") return "NEUTRAL";
  if (status === "ILLIQUID") return "ILLIQUID";

  const spot = bands.spot;
  if (spot == null || !Number.isFinite(spot)) return "ILLIQUID";
  return nearestBandKind(bands, spot) === "bull" ? "NEAR_BULL" : "NEAR_BEAR";
}

/**
 * Bubble-map + slideshow strip tone: geographic zone position, gated by min 2:1 POC RR.
 * Fails RR → NEUTRAL (grey “between zones”) so filter counts match qualified setups only.
 */
export function deriveBubbleDisplayTone(
  bands: ZoneBands,
  scanned: boolean,
  _meetsActionableSetup?: boolean,
  poc?: number | null,
  bandOffset?: number | null,
  oi?: OiWallMomentum | null,
): BubbleTone {
  const geo = deriveBubbleTone(bands, scanned);
  if (
    geo === "IN_BULL" ||
    geo === "IN_BEAR" ||
    geo === "NEAR_BULL" ||
    geo === "NEAR_BEAR"
  ) {
    if (!bubbleTonePassesMinRR(geo, bands, poc, bandOffset, oi)) return "NEUTRAL";
  }
  return geo;
}

const INDEX_SILVER_RING = "rgba(192, 202, 214, 0.92)";

/** Index bubbles are always largest; neutral indices use a silver ring. */
export function resolveBubbleVisual(
  scope: "index" | "stock",
  tone: BubbleTone,
): BubbleToneStyle {
  const base = BUBBLE_TONE_STYLE[tone];
  if (scope !== "index") return base;

  if (tone === "NEUTRAL" || tone === "ILLIQUID" || tone === "UNSCANNED") {
    return {
      ...base,
      fill: BUBBLE_CORE_FILL,
      border: INDEX_SILVER_RING,
      borderStyle: "solid",
      borderWidth: 3,
      glow: "0 0 18px rgba(148, 163, 184, 0.28)",
      label: tone === "UNSCANNED" ? base.label : "Index · between zones",
    };
  }

  if (tone === "IN_BULL" || tone === "IN_BEAR") {
    return { ...base, borderWidth: 5 };
  }

  if (tone === "NEAR_BULL" || tone === "NEAR_BEAR") {
    return { ...base, borderWidth: 4, borderStyle: "dotted" };
  }

  return base;
}
