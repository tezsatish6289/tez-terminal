import { deriveZoneStatus, type ZoneBands } from "@/lib/zones/zone-status";

/** Visual tone for the levels bubble map (splits generic NEAR by closest band). */
export type BubbleTone =
  | "IN_BULL"
  | "IN_BEAR"
  | "NEAR_BULL"
  | "NEAR_BEAR"
  | "NEUTRAL"
  | "ILLIQUID";

export interface BubbleToneStyle {
  fill: string;
  glow: string;
  border: string;
  label: string;
}

export const BUBBLE_TONE_STYLE: Record<BubbleTone, BubbleToneStyle> = {
  IN_BULL: {
    fill: "rgba(34, 197, 94, 0.42)",
    glow: "0 0 28px rgba(34, 197, 94, 0.55), 0 0 56px rgba(34, 197, 94, 0.22)",
    border: "rgba(74, 222, 128, 0.85)",
    label: "In bull zone",
  },
  IN_BEAR: {
    fill: "rgba(239, 68, 68, 0.42)",
    glow: "0 0 28px rgba(239, 68, 68, 0.55), 0 0 56px rgba(239, 68, 68, 0.22)",
    border: "rgba(248, 113, 113, 0.85)",
    label: "In bear zone",
  },
  NEAR_BULL: {
    fill: "rgba(134, 239, 172, 0.28)",
    glow: "0 0 18px rgba(134, 239, 172, 0.4)",
    border: "rgba(134, 239, 172, 0.65)",
    label: "Near bull zone",
  },
  NEAR_BEAR: {
    fill: "rgba(252, 165, 165, 0.28)",
    glow: "0 0 18px rgba(248, 113, 113, 0.35)",
    border: "rgba(252, 165, 165, 0.65)",
    label: "Near bear zone",
  },
  NEUTRAL: {
    fill: "rgba(100, 116, 139, 0.18)",
    glow: "none",
    border: "rgba(148, 163, 184, 0.25)",
    label: "Neutral",
  },
  ILLIQUID: {
    fill: "rgba(71, 85, 105, 0.14)",
    glow: "none",
    border: "rgba(100, 116, 139, 0.18)",
    label: "No data",
  },
};

function nearestBandKind(bands: ZoneBands, spot: number): "bull" | "bear" {
  const edges: { kind: "bull" | "bear"; edge: number }[] = [];
  if (bands.bullLow != null) edges.push({ kind: "bull", edge: bands.bullLow });
  if (bands.bullHigh != null) edges.push({ kind: "bull", edge: bands.bullHigh });
  if (bands.bearLow != null) edges.push({ kind: "bear", edge: bands.bearLow });
  if (bands.bearHigh != null) edges.push({ kind: "bear", edge: bands.bearHigh });

  if (edges.length === 0) return "bull";

  let best = edges[0];
  let bestDist = Math.abs(spot - best.edge);
  for (let i = 1; i < edges.length; i++) {
    const d = Math.abs(spot - edges[i].edge);
    if (d < bestDist) {
      best = edges[i];
      bestDist = d;
    }
  }
  return best.kind;
}

export function deriveBubbleTone(bands: ZoneBands): BubbleTone {
  const status = deriveZoneStatus(bands);
  if (status === "IN_BULL") return "IN_BULL";
  if (status === "IN_BEAR") return "IN_BEAR";
  if (status === "NEUTRAL") return "NEUTRAL";
  if (status === "ILLIQUID") return "ILLIQUID";

  const spot = bands.spot;
  if (spot == null || !Number.isFinite(spot)) return "ILLIQUID";
  return nearestBandKind(bands, spot) === "bull" ? "NEAR_BULL" : "NEAR_BEAR";
}
