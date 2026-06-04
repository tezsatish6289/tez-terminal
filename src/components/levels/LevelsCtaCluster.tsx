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

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function CtaPill({ action }: { action: LevelsCtaAction }) {
  const { fill, border, text, countText } = pillStyle(action.tone ?? "default");
  const className = `inline-flex items-center gap-1 px-2.5 sm:px-3 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full shrink-0`;
  const style = {
    background: fill,
    border: `1px solid ${border}`,
  };
  const labelEl = (
    <>
      <span
        className="text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
        style={{ color: text, lineHeight: 1.2 }}
      >
        {action.label}
      </span>
      {action.count != null ? (
        <span
          className="text-[9px] font-semibold tabular-nums whitespace-nowrap"
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
  enableChartKeys,
  chartKeys,
}: {
  actions: LevelsCtaAction[];
  align?: "start" | "end";
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

  return (
    <div
      className={`shrink-0 inline-flex items-center gap-1 rounded-full p-[3px] ${align === "end" ? "ml-auto" : ""}`}
      style={BLACKBOARD_WRAPPER}
    >
      {actions.map((action) => (
        <CtaPill key={action.id} action={action} />
      ))}
    </div>
  );
}
