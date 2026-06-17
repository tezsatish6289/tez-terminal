/**
 * FNONINJA brand tokens for the video, mirrored from the app
 * (src/lib/fnoninja/theme.ts + src/lib/levels/zone-chart-colors.ts) so the
 * videos look identical to the product. Kept as a standalone copy because the
 * Remotion project is an isolated package.
 */

export const FNO = {
  bg: "#080f1e",
  bgCanvas: "#070d1a",
  card: "#0d1b2e",
  cardBorder: "rgba(90,140,220,0.2)",
  text: "#f0f4ff",
  muted: "#64748b",
  subtle: "#94a3b8",
  accent: "#60a5fa",
  logoMark: "#3b82f6",
  gradientText: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)",
  ctaGradient: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  ctaShadow: "0 6px 20px rgba(59,130,246,0.4)",
} as const;

/** Soft blue glow + faint grid, matching the app's chart surface. */
export const FNO_SURFACE_BG = `
  radial-gradient(ellipse 90% 45% at 50% 0%, rgba(37,99,235,0.18), transparent),
  radial-gradient(ellipse 70% 40% at 50% 100%, rgba(37,99,235,0.08), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
`;
export const FNO_SURFACE_SIZE = "100% 100%, 100% 100%, 54px 54px, 54px 54px";

/** Bull (put-wall support) + bear (call-wall resistance) palette. */
export const ZONE = {
  bull: {
    line: "#22c55e",
    candleUp: "#16a34a",
    bandFill: "rgba(34, 197, 94, 0.22)",
    bandFillSoft: "rgba(34, 197, 94, 0.10)",
    bandBorder: "rgba(74, 222, 128, 0.55)",
    label: "#86efac",
    badgeBg: "rgba(34, 197, 94, 0.14)",
  },
  bear: {
    line: "#ef4444",
    candleDown: "#dc2626",
    bandFill: "rgba(239, 68, 68, 0.22)",
    bandFillSoft: "rgba(239, 68, 68, 0.10)",
    bandBorder: "rgba(248, 113, 113, 0.55)",
    label: "#fca5a5",
    badgeBg: "rgba(239, 68, 68, 0.14)",
  },
  maxPain: {
    line: "#fbbf24",
    label: "#fbbf24",
  },
} as const;

export const FONT_STACK =
  '"Inter", "Helvetica Neue", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
