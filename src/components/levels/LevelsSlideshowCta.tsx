"use client";

import { useEffect, useRef, useState } from "react";
import { BLACKBOARD_CHALK, BLACKBOARD_FILL_ACTIVE, BLACKBOARD_WRAPPER } from "@/lib/levels/cta-blackboard";

/** Short bright segment travels along the stroke path (not a spinning fill). */
const CTA_BORDER_CSS = `
@keyframes levels-cta-border-run {
  to { stroke-dashoffset: -100; }
}
`;

/** Same row height as zone legend chips (`h-7`). */
export const LEVELS_TOOLBAR_CHIP_HEIGHT = "h-7";

const BORDER_INSET = 1;
const BORDER_PAD = 3;

const RUNNER_DIM = "rgba(226, 232, 240, 0.35)";
const RUNNER_BRIGHT = "#e8edf4";
const RUNNER_MID = "rgba(203, 213, 225, 0.75)";

/** View toggle only — blackboard fill + running light on the border. */
export function LevelsSlideshowCta({
  label,
  shortLabel,
  onClick,
  title,
}: {
  label: string;
  /** Shown below sm when label is long (e.g. view toggle). */
  shortLabel?: string;
  onClick: () => void;
  title?: string;
}) {
  const displayLabel = shortLabel ?? label;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setBox({ w: Math.ceil(width), h: Math.ceil(height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);

  const rw = Math.max(0, box.w - BORDER_INSET * 2);
  const rh = Math.max(0, box.h - BORDER_INSET * 2);
  const rx = rh > 0 ? rh / 2 : 14;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CTA_BORDER_CSS }} />
      <span
        ref={wrapRef}
        className="relative inline-flex shrink-0 rounded-full"
        style={{
          padding: BORDER_PAD,
          ...BLACKBOARD_WRAPPER,
        }}
      >
        {box.w > 4 && box.h > 4 ? (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={box.w}
            height={box.h}
            viewBox={`0 0 ${box.w} ${box.h}`}
            aria-hidden
          >
            <rect
              x={BORDER_INSET}
              y={BORDER_INSET}
              width={rw}
              height={rh}
              rx={rx}
              ry={rx}
              fill="none"
              stroke={RUNNER_DIM}
              strokeWidth={1.25}
            />
            <rect
              x={BORDER_INSET}
              y={BORDER_INSET}
              width={rw}
              height={rh}
              rx={rx}
              ry={rx}
              fill="none"
              stroke={RUNNER_BRIGHT}
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="10 90"
              style={{ animation: "levels-cta-border-run 2.1s linear infinite" }}
            />
            <rect
              x={BORDER_INSET}
              y={BORDER_INSET}
              width={rw}
              height={rh}
              rx={rx}
              ry={rx}
              fill="none"
              stroke={RUNNER_MID}
              strokeWidth={1.5}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="6 94"
              style={{
                animation: "levels-cta-border-run 2.1s linear infinite",
                animationDelay: "-0.35s",
              }}
            />
          </svg>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          title={title}
          className={`relative z-[1] inline-flex items-center gap-1.5 px-4 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full transition-colors hover:border-slate-300/35 active:scale-[0.98]`}
          style={{
            background: BLACKBOARD_FILL_ACTIVE,
            border: "1px solid rgba(226, 232, 240, 0.18)",
            boxShadow: "none",
          }}
        >
          <span
            className="text-[9px] font-bold uppercase tracking-wide sm:whitespace-nowrap max-w-[min(72vw,16rem)] sm:max-w-none truncate"
            style={{ color: BLACKBOARD_CHALK, lineHeight: 1.2 }}
          >
            <span className="sm:hidden">{displayLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </span>
          <span
            className="text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap hidden sm:inline"
            style={{ color: "rgba(203, 213, 225, 0.75)", lineHeight: 1.2 }}
          >
            · S
          </span>
        </button>
      </span>
    </>
  );
}
