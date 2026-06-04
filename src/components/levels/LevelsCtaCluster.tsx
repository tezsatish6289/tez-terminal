"use client";

import { useEffect } from "react";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";

export const LEVELS_CTA_FILL = "#1d4ed8";
export const LEVELS_CTA_ACCENT = "#60a5fa";
export const LEVELS_CTA_ACCENT_RGB = "96, 165, 250";
const PAUSED_PINK = "#f472b6";

export interface LevelsCtaAction {
  id: string;
  label: string;
  kbd?: string;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  /** Read-only pill (e.g. aligned count). */
  static?: boolean;
  tone?:
    | "default"
    | "default-muted"
    | "bull"
    | "bull-muted"
    | "bear"
    | "bear-muted"
    | "paused";
  count?: number;
}

function pillStyle(tone: LevelsCtaAction["tone"]): {
  fill: string;
  border: string;
  text: string;
  countText: string;
} {
  switch (tone) {
    case "paused":
      return {
        fill: "rgba(157, 23, 77, 0.92)",
        border: PAUSED_PINK,
        text: "#ffffff",
        countText: "rgba(255,255,255,0.85)",
      };
    case "bull":
      return {
        fill: "rgba(4, 120, 87, 0.95)",
        border: "#4ade80",
        text: "#ffffff",
        countText: "rgba(255,255,255,0.9)",
      };
    case "bull-muted":
      return {
        fill: "rgba(16, 185, 129, 0.14)",
        border: "rgba(74, 222, 128, 0.28)",
        text: "rgba(134, 239, 172, 0.95)",
        countText: "rgba(110, 231, 183, 0.75)",
      };
    case "bear":
      return {
        fill: "rgba(153, 27, 27, 0.95)",
        border: "#f87171",
        text: "#ffffff",
        countText: "rgba(255,255,255,0.9)",
      };
    case "bear-muted":
      return {
        fill: "rgba(239, 68, 68, 0.14)",
        border: "rgba(248, 113, 113, 0.28)",
        text: "rgba(252, 165, 165, 0.95)",
        countText: "rgba(248, 113, 113, 0.75)",
      };
    case "default-muted":
      return {
        fill: "rgba(37, 99, 235, 0.14)",
        border: "rgba(96, 165, 250, 0.28)",
        text: "rgba(147, 197, 253, 0.95)",
        countText: "rgba(96, 165, 250, 0.75)",
      };
    default:
      return {
        fill: LEVELS_CTA_FILL,
        border: LEVELS_CTA_ACCENT,
        text: "#ffffff",
        countText: "rgba(255,255,255,0.85)",
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
  const muted = action.tone?.endsWith("-muted");
  const labelEl = (
    <>
      <span
        className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
        style={{
          color: text,
          lineHeight: 1.2,
          textShadow: muted ? "none" : "0 1px 1px rgba(15, 23, 42, 0.55)",
        }}
      >
        {action.label}
      </span>
      {action.count != null ? (
        <span
          className="text-[9px] font-bold tabular-nums whitespace-nowrap"
          style={{ color: countText, lineHeight: 1.2 }}
        >
          ({action.count})
        </span>
      ) : null}
      {action.kbd ? (
        <span
          className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap"
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
      className={`${className} transition-all hover:brightness-[1.06] active:scale-[0.98]`}
      style={style}
    >
      {labelEl}
    </button>
  );
}

/** Clubbed blue CTA pills — shared outer glow, tight grouping. */
export function LevelsCtaCluster({
  actions,
  align = "end",
  variant = "shortcuts",
  enableChartKeys,
  chartKeys,
}: {
  actions: LevelsCtaAction[];
  /** `start` = filter cluster (left); `end` = shortcuts (right). */
  align?: "start" | "end";
  /** Neutral wrapper for multi-color filter pills. */
  variant?: "shortcuts" | "filters";
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

  const wrapperStyle =
    variant === "filters"
      ? {
          background: "rgba(0, 0, 0, 0.35)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 0 16px rgba(0, 0, 0, 0.35)",
        }
      : {
          background: "rgba(29, 78, 216, 0.22)",
          border: `1px solid ${LEVELS_CTA_ACCENT}`,
          boxShadow: `0 0 12px rgba(${LEVELS_CTA_ACCENT_RGB}, 0.65), 0 0 26px rgba(${LEVELS_CTA_ACCENT_RGB}, 0.38)`,
        };

  return (
    <div
      className={`shrink-0 inline-flex items-center gap-1 rounded-full p-[3px] ${align === "end" ? "ml-auto" : ""}`}
      style={wrapperStyle}
    >
      {actions.map((action) => (
        <CtaPill key={action.id} action={action} />
      ))}
    </div>
  );
}
