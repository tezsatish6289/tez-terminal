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
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  /** Pause/play uses pink accent while paused. */
  tone?: "default" | "paused";
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function CtaPill({ action }: { action: LevelsCtaAction }) {
  const paused = action.tone === "paused";
  const fill = paused ? "rgba(157, 23, 77, 0.92)" : LEVELS_CTA_FILL;
  const border = paused ? PAUSED_PINK : LEVELS_CTA_ACCENT;

  return (
    <button
      type="button"
      onClick={action.onClick}
      title={action.title}
      aria-label={action.ariaLabel ?? action.label}
      className={`inline-flex items-center gap-1 px-2.5 sm:px-3 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full transition-all hover:brightness-[1.06] active:scale-[0.98] shrink-0`}
      style={{
        background: fill,
        border: `1px solid ${border}`,
      }}
    >
      <span
        className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
        style={{
          color: "#ffffff",
          lineHeight: 1.2,
          textShadow: "0 1px 1px rgba(15, 23, 42, 0.55)",
        }}
      >
        {action.label}
      </span>
      {action.kbd ? (
        <span
          className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap"
          style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.2 }}
        >
          · {action.kbd}
        </span>
      ) : null}
    </button>
  );
}

/** Clubbed blue CTA pills — shared outer glow, tight grouping. */
export function LevelsCtaCluster({
  actions,
  enableChartKeys,
  chartKeys,
}: {
  actions: LevelsCtaAction[];
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
      className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full p-[3px]"
      style={{
        background: "rgba(29, 78, 216, 0.22)",
        border: `1px solid ${LEVELS_CTA_ACCENT}`,
        boxShadow: `0 0 12px rgba(${LEVELS_CTA_ACCENT_RGB}, 0.65), 0 0 26px rgba(${LEVELS_CTA_ACCENT_RGB}, 0.38)`,
      }}
    >
      {actions.map((action) => (
        <CtaPill key={action.id} action={action} />
      ))}
    </div>
  );
}
