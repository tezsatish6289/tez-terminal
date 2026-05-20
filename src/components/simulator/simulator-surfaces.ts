import { cn } from "@/lib/utils";

/** Raised panel — toolbar, main trade panel, heatmap section wrapper. */
export const SIM_PANEL = cn(
  "rounded-2xl border border-white/[0.14] bg-[#131316]",
  "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8),0_4px_14px_-4px_rgba(0,0,0,0.55)]",
  "ring-1 ring-inset ring-white/[0.04]",
);

/** Standard card — heatmap tiles, stat chips. */
export const SIM_CARD = cn(
  "rounded-xl border border-white/[0.12] bg-[#16161a]",
  "shadow-[0_8px_28px_-8px_rgba(0,0,0,0.7),0_2px_8px_-2px_rgba(0,0,0,0.45)]",
  "ring-1 ring-inset ring-white/[0.05]",
);

/** Clickable trade / position card. */
export const SIM_CARD_INTERACTIVE = cn(
  SIM_CARD,
  "transition-all duration-200",
  "hover:border-white/[0.2]",
  "hover:shadow-[0_14px_36px_-10px_rgba(0,0,0,0.85),0_4px_12px_-2px_rgba(0,0,0,0.5)]",
  "hover:-translate-y-0.5",
);

/** Empty slot — inset feel but still visible edge. */
export const SIM_SLOT_EMPTY = cn(
  "rounded-xl border-2 border-dashed border-white/[0.14] bg-[#0f0f12]",
  "shadow-[inset_0_2px_12px_rgba(0,0,0,0.5),0_6px_24px_-10px_rgba(0,0,0,0.55)]",
);

/** Inner zone pill (bull/bear inside heatmap). */
export const SIM_INSET_TILE = cn(
  "rounded-lg border border-white/[0.1] bg-[#1a1a1f]",
  "shadow-[inset_0_1px_4px_rgba(0,0,0,0.35),0_2px_6px_-2px_rgba(0,0,0,0.3)]",
);
