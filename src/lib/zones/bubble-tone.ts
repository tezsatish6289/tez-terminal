import { deriveZoneStatus, type ZoneBands } from "@/lib/zones/zone-status";

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
}

export const BUBBLE_TONE_STYLE: Record<BubbleTone, BubbleToneStyle> = {
  IN_BULL: {
    solid: true,
    /** Flat dark fill (#047857); rim + halo use matching accent #34d399 — no inner glow. */
    fill: "#047857",
    glow:
      "0 0 12px rgba(52, 211, 153, 0.8), 0 0 28px rgba(52, 211, 153, 0.5), 0 0 48px rgba(52, 211, 153, 0.25)",
    border: "#34d399",
    borderStyle: "solid",
    borderWidth: 3,
    label: "In bull zone",
  },
  IN_BEAR: {
    solid: true,
    /** Flat dark fill (#b91c1c); rim + halo use matching accent #f87171 — no inner glow. */
    fill: "#b91c1c",
    glow:
      "0 0 12px rgba(248, 113, 113, 0.8), 0 0 28px rgba(248, 113, 113, 0.5), 0 0 48px rgba(248, 113, 113, 0.25)",
    border: "#f87171",
    borderStyle: "solid",
    borderWidth: 3,
    label: "In bear zone",
  },
  NEAR_BULL: {
    solid: false,
    fill: "radial-gradient(circle at 40% 35%, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.88) 100%)",
    glow: "0 0 10px rgba(190, 242, 100, 0.38)",
    border: "#bef264",
    borderStyle: "dashed",
    borderWidth: 2,
    label: "Near bull zone",
  },
  NEAR_BEAR: {
    solid: false,
    fill: "radial-gradient(circle at 40% 35%, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.88) 100%)",
    glow: "0 0 10px rgba(251, 146, 60, 0.38)",
    border: "#fdba74",
    borderStyle: "dashed",
    borderWidth: 2,
    label: "Near bear zone",
  },
  NEUTRAL: {
    solid: false,
    fill: "radial-gradient(circle at 40% 35%, rgba(71, 85, 105, 0.35) 0%, rgba(30, 41, 59, 0.7) 100%)",
    glow: "0 0 8px rgba(148, 163, 184, 0.2)",
    border: "rgba(148, 163, 184, 0.5)",
    borderStyle: "solid",
    borderWidth: 1,
    label: "Scanned · between zones",
  },
  ILLIQUID: {
    solid: false,
    fill: "radial-gradient(circle at 40% 35%, rgba(51, 65, 85, 0.4) 0%, rgba(30, 41, 59, 0.75) 100%)",
    glow: "none",
    border: "rgba(100, 116, 139, 0.4)",
    borderStyle: "solid",
    borderWidth: 1,
    label: "Scanned · no bands",
  },
  UNSCANNED: {
    solid: false,
    fill: "radial-gradient(circle at 40% 35%, rgba(71, 85, 105, 0.32) 0%, rgba(51, 65, 85, 0.55) 100%)",
    glow: "none",
    border: "rgba(148, 163, 184, 0.45)",
    borderStyle: "dashed",
    borderWidth: 2,
    label: "Awaiting scan",
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
