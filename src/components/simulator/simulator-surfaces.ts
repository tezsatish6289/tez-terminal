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

/** Cockpit detail card — left rail glass inset panel. */
export const COCKPIT_RAIL_GLASS = cn(
  "rounded-2xl border border-white/[0.08]",
  "bg-gradient-to-b from-white/[0.04] to-white/[0.01]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_32px_-12px_rgba(0,0,0,0.65)]",
  "backdrop-blur-sm p-3",
);

/** Full-width pill action on the cockpit left rail (Manual / Config). */
export const COCKPIT_RAIL_ACTION_BTN = cn(
  "w-full flex items-center justify-center gap-2 rounded-full",
  "border border-accent/40 bg-accent/[0.07]",
  "px-4 py-2.5",
  "text-[10px] font-black uppercase tracking-[0.14em] text-accent",
  "shadow-[0_0_22px_-8px_hsl(var(--accent)/0.55),inset_0_1px_0_rgba(255,255,255,0.06)]",
  "hover:bg-accent/[0.12] hover:border-accent/55 transition-all duration-200",
);

/** Open position card — inner glass data panel. */
export const POSITION_TRADE_GLASS = cn(
  "rounded-2xl border border-accent/20",
  "bg-gradient-to-b from-white/[0.05] to-white/[0.015]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_28px_-10px_hsl(var(--accent)/0.35)]",
  "backdrop-blur-sm p-3.5 space-y-3",
);
