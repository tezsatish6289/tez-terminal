"use client";

import { useEffect } from "react";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FILL_ACTIVE,
  BLACKBOARD_WRAPPER,
} from "@/lib/levels/cta-blackboard";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";

export interface LevelsCtaAction {
  id: string;
  label: string;
  kbd?: string;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  static?: boolean;
  tone?:
    | "default"
    | "default-muted"
    | "bull"
    | "bull-muted"
    | "bear"
    | "bear-muted"
    | "paused"
    | "paused-muted";
  /** Dotted ring for near-zone filters (matches bubble map). */
  ringStyle?: "solid" | "dotted";
  count?: number;
}

function pillStyle(tone: LevelsCtaAction["tone"]): {
  fill: string;
  border: string;
  text: string;
  countText: string;
} {
  switch (tone) {
    case "bull":
      return {
        fill: "rgba(6, 78, 59, 0.42)",
        border: "rgba(134, 239, 172, 0.38)",
        text: "#d1fae5",
        countText: "rgba(167, 243, 208, 0.85)",
      };
    case "bull-muted":
      return {
        fill: "rgba(6, 78, 59, 0.1)",
        border: "rgba(74, 222, 128, 0.16)",
        text: "rgba(110, 231, 183, 0.55)",
        countText: "rgba(110, 231, 183, 0.45)",
      };
    case "bear":
      return {
        fill: "rgba(127, 29, 29, 0.42)",
        border: "rgba(252, 165, 165, 0.38)",
        text: "#fecaca",
        countText: "rgba(254, 202, 202, 0.85)",
      };
    case "bear-muted":
      return {
        fill: "rgba(127, 29, 29, 0.1)",
        border: "rgba(248, 113, 113, 0.16)",
        text: "rgba(252, 165, 165, 0.55)",
        countText: "rgba(248, 113, 113, 0.45)",
      };
    case "paused":
      return {
        fill: "rgba(131, 24, 67, 0.38)",
        border: "rgba(244, 114, 182, 0.35)",
        text: "#fbcfe8",
        countText: "rgba(251, 207, 232, 0.85)",
      };
    case "paused-muted":
      return {
        fill: "rgba(22, 28, 42, 0.92)",
        border: "rgba(148, 163, 184, 0.14)",
        text: BLACKBOARD_CHALK_DIM,
        countText: BLACKBOARD_CHALK_DIM,
      };
    case "default-muted":
      return {
        fill: "rgba(15, 23, 42, 0.45)",
        border: "rgba(148, 163, 184, 0.12)",
        text: BLACKBOARD_CHALK_DIM,
        countText: "rgba(100, 116, 139, 0.65)",
      };
    default:
      return {
        fill: BLACKBOARD_FILL_ACTIVE,
        border: "rgba(226, 232, 240, 0.22)",
        text: BLACKBOARD_CHALK,
        countText: "rgba(203, 213, 225, 0.8)",
      };
  }
}

const FILTER_WRAPPER = {
  background: "rgba(14, 20, 32, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
} as const;

function isActiveTone(tone: LevelsCtaAction["tone"]): boolean {
  return tone != null && !tone.endsWith("-muted");
}

/** Higher-contrast pills for zone filter tabs. */
function filterPillStyle(tone: LevelsCtaAction["tone"]): ReturnType<typeof pillStyle> & {
  glow?: string;
} {
  switch (tone) {
    case "bull":
      return {
        fill: "rgba(6, 78, 59, 0.58)",
        border: "#4ade80",
        text: "#ecfdf5",
        countText: "#bbf7d0",
        glow: "0 0 14px rgba(34, 197, 94, 0.35)",
      };
    case "bull-muted":
      return {
        fill: "rgba(6, 78, 59, 0.18)",
        border: "rgba(74, 222, 128, 0.42)",
        text: "rgba(134, 239, 172, 0.92)",
        countText: "rgba(110, 231, 183, 0.78)",
      };
    case "bear":
      return {
        fill: "rgba(127, 29, 29, 0.58)",
        border: "#f87171",
        text: "#fef2f2",
        countText: "#fecaca",
        glow: "0 0 14px rgba(239, 68, 68, 0.35)",
      };
    case "bear-muted":
      return {
        fill: "rgba(127, 29, 29, 0.18)",
        border: "rgba(248, 113, 113, 0.42)",
        text: "rgba(252, 165, 165, 0.92)",
        countText: "rgba(248, 113, 113, 0.78)",
      };
    case "default-muted":
      return {
        fill: "rgba(22, 28, 42, 0.88)",
        border: "rgba(148, 163, 184, 0.28)",
        text: "rgba(203, 213, 225, 0.88)",
        countText: "rgba(148, 163, 184, 0.75)",
      };
    default:
      return {
        fill: "rgba(38, 48, 68, 0.98)",
        border: "#e2e8f0",
        text: "#f8fafc",
        countText: "rgba(226, 232, 240, 0.9)",
        glow: "0 0 12px rgba(148, 163, 184, 0.2)",
      };
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function CtaPill({
  action,
  variant = "default",
}: {
  action: LevelsCtaAction;
  variant?: "default" | "filter";
}) {
  const isFilter = variant === "filter";
  const palette = isFilter
    ? filterPillStyle(action.tone ?? "default")
    : pillStyle(action.tone ?? "default");
  const { fill, border, text, countText } = palette;
  const glow = "glow" in palette ? palette.glow : undefined;
  const active = isActiveTone(action.tone);
  const ring = action.ringStyle ?? "solid";
  const borderW = isFilter ? (active ? 2 : 1.5) : 1;
  const chipHeight = isFilter ? "h-8" : LEVELS_TOOLBAR_CHIP_HEIGHT;
  const labelSize = isFilter ? "text-[10px]" : "text-[9px]";
  const className = `inline-flex items-center gap-1.5 px-3 sm:px-3.5 ${chipHeight} rounded-full shrink-0`;
  const style = {
    background: fill,
    border: `${borderW}px ${ring} ${border}`,
    boxShadow: glow,
  };
  const labelEl = (
    <>
      <span
        className={`${labelSize} font-black uppercase tracking-wide whitespace-nowrap`}
        style={{ color: text, lineHeight: 1.2 }}
      >
        {action.label}
      </span>
      {action.count != null ? (
        <span
          className={`${labelSize} font-bold tabular-nums whitespace-nowrap`}
          style={{ color: countText, lineHeight: 1.2 }}
        >
          ({action.count})
        </span>
      ) : null}
      {action.kbd ? (
        <span
          className="text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap"
          style={{ color: countText, lineHeight: 1.2 }}
        >
          · {action.kbd}
        </span>
      ) : null}
    </>
  );

  if (action.static || !action.onClick) {
    return (
      <span className={className} style={style} title={action.title}>
        {labelEl}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      title={action.title}
      aria-label={action.ariaLabel ?? action.label}
      className={`${className} transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
      style={style}
    >
      {labelEl}
    </button>
  );
}

/** Clubbed blackboard pills — chalk labels on matte dark bar. */
export function LevelsCtaCluster({
  actions,
  align = "end",
  variant = "default",
  enableChartKeys,
  chartKeys,
}: {
  actions: LevelsCtaAction[];
  align?: "start" | "end";
  variant?: "default" | "filter";
  enableChartKeys?: boolean;
  chartKeys?: {
    webChartUrl: string;
    showSqueeze?: boolean;
    onSqueeze?: () => void;
    showSlideshowControl?: boolean;
    onToggleSlideshowPause?: () => void;
  };
}) {
  useEffect(() => {
    if (!enableChartKeys || !chartKeys) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if ((e.key === "t" || e.key === "T") && chartKeys.webChartUrl) {
        e.preventDefault();
        window.open(chartKeys.webChartUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (e.key === "3" && chartKeys.showSqueeze && chartKeys.onSqueeze) {
        e.preventDefault();
        chartKeys.onSqueeze();
        return;
      }
      if (
        (e.key === "p" || e.key === "P") &&
        chartKeys.showSlideshowControl &&
        chartKeys.onToggleSlideshowPause
      ) {
        e.preventDefault();
        chartKeys.onToggleSlideshowPause();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableChartKeys, chartKeys]);

  if (actions.length === 0) return null;

  const isFilter = variant === "filter";

  return (
    <div
      className={`shrink-0 inline-flex items-center ${isFilter ? "gap-1.5" : "gap-1"} rounded-full ${isFilter ? "p-1" : "p-[3px]"} ${align === "end" ? "ml-auto" : ""}`}
      style={isFilter ? FILTER_WRAPPER : BLACKBOARD_WRAPPER}
    >
      {actions.map((action) => (
        <CtaPill key={action.id} action={action} variant={variant} />
      ))}
    </div>
  );
}
