import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { deriveZoneStatus, nearestBandKind, type ZoneBands } from "@/lib/zones/zone-status";

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
  borderStyle: "solid" | "dashed";
  borderWidth: number;
  label: string;
  /** Symbol/price text on the bubble (in-zone matches chart zone labels). */
  textColor: string;
  textMutedColor: string;
}

const { bull, bear } = LEVELS_ZONE_CHART;

export const BUBBLE_TONE_STYLE: Record<BubbleTone, BubbleToneStyle> = {
  IN_BULL: {
    solid: true,
    fill: bull.bandFill,
    glow: bull.bandGlow,
    border: bull.bandBorderSolid,
    borderStyle: "solid",
    borderWidth: 3,
    label: "At Support",
    textColor: bull.labelText,
    textMutedColor: bull.labelTextMuted,
  },
  IN_BEAR: {
    solid: true,
    fill: bear.bandFill,
    glow: bear.bandGlow,
    border: bear.bandBorderSolid,
    borderStyle: "solid",
    borderWidth: 3,
    label: "At Resistance",
    textColor: bear.labelText,
    textMutedColor: bear.labelTextMuted,
  },
  NEAR_BULL: {
    solid: false,
    fill: "rgba(15, 23, 42, 0.88)",
    glow: bull.bandGlow,
    border: bull.bandBorderSolid,
    borderStyle: "dashed",
    borderWidth: 2,
    label: "Near Support",
    textColor: "#f8fafc",
    textMutedColor: "#cbd5e1",
  },
  NEAR_BEAR: {
    solid: false,
    fill: "rgba(15, 23, 42, 0.88)",
    glow: bear.bandGlow,
    border: bear.bandBorderSolid,
    borderStyle: "dashed",
    borderWidth: 2,
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
 * Bubble-map tone: solid in-zone only when the symbol passes the same actionable
 * gate as the slideshow (directional + min POC RR). Otherwise geographic
 * in-zone is shown as near-zone styling.
 */
export function deriveBubbleDisplayTone(
  bands: ZoneBands,
  scanned: boolean,
  meetsActionableSetup: boolean,
): BubbleTone {
  const raw = deriveBubbleTone(bands, scanned);
  if (meetsActionableSetup && (raw === "IN_BULL" || raw === "IN_BEAR")) {
    return raw;
  }
  if (raw === "IN_BULL") return "NEAR_BULL";
  if (raw === "IN_BEAR") return "NEAR_BEAR";
  return raw;
}
