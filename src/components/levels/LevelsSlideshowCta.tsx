"use client";

import { useEffect, useRef, useState } from "react";
import { GalleryHorizontal, Star } from "lucide-react";
import { BLACKBOARD_CHALK, BLACKBOARD_WRAPPER } from "@/lib/levels/cta-blackboard";
import {
  FNO_FAVSLIDE_ACCENT,
  FNO_LIVESLIDE_ACCENT,
} from "@/lib/fnoninja/theme";

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

export type LevelsSlideCtaVariant = "liveslide" | "favslide";

const VARIANT_STYLE: Record<
  LevelsSlideCtaVariant,
  {
    fill: string;
    fillActive: string;
    border: string;
    borderActive: string;
    chalk: string;
    runnerDim: string;
    runnerBright: string;
    runnerMid: string;
    kbdColor: string;
  }
> = {
  liveslide: {
    fill: "rgba(37,99,235,0.1)",
    fillActive: "rgba(37,99,235,0.2)",
    border: "rgba(96,165,250,0.28)",
    borderActive: "rgba(96,165,250,0.5)",
    chalk: "#93c5fd",
    runnerDim: "rgba(96,165,250,0.22)",
    runnerBright: FNO_LIVESLIDE_ACCENT,
    runnerMid: "rgba(147,197,253,0.6)",
    kbdColor: "rgba(147,197,253,0.8)",
  },
  favslide: {
    fill: "rgba(251,191,36,0.1)",
    fillActive: "rgba(251,191,36,0.18)",
    border: "rgba(251,191,36,0.3)",
    borderActive: "rgba(251,191,36,0.52)",
    chalk: "#fcd34d",
    runnerDim: "rgba(251,191,36,0.2)",
    runnerBright: FNO_FAVSLIDE_ACCENT,
    runnerMid: "rgba(252,211,77,0.58)",
    kbdColor: "rgba(252,211,77,0.8)",
  },
};

/** View toggle — blackboard fill + running light on the border. */
export function LevelsSlideshowCta({
  label,
  shortLabel,
  onClick,
  title,
  variant,
  kbd,
  active = false,
}: {
  label: string;
  /** Shown below sm when label is long (e.g. view toggle). */
  shortLabel?: string;
  onClick: () => void;
  title?: string;
  variant: LevelsSlideCtaVariant;
  kbd: string;
  /** Highlight when this slideshow mode is active. */
  active?: boolean;
}) {
  const displayLabel = shortLabel ?? label;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const tone = VARIANT_STYLE[variant];
  const Icon = variant === "favslide" ? Star : GalleryHorizontal;

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
              stroke={tone.runnerDim}
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
              stroke={tone.runnerBright}
              strokeWidth={active ? 2.25 : 2}
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
              stroke={tone.runnerMid}
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
          className={`relative z-[1] inline-flex items-center gap-1.5 px-3 sm:px-4 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full transition-colors active:scale-[0.98]`}
          style={{
            background: active ? tone.fillActive : tone.fill,
            border: `1px solid ${active ? tone.borderActive : tone.border}`,
            boxShadow: active ? `0 0 14px ${tone.runnerDim}` : "none",
          }}
        >
          <Icon
            className="h-3 w-3 shrink-0 hidden sm:block"
            style={{ color: tone.chalk }}
            fill={variant === "favslide" && active ? tone.chalk : "none"}
            strokeWidth={2}
          />
          <span
            className="text-[9px] font-bold uppercase tracking-wide sm:whitespace-nowrap max-w-[min(72vw,16rem)] sm:max-w-none truncate"
            style={{ color: active ? tone.chalk : BLACKBOARD_CHALK, lineHeight: 1.2 }}
          >
            <span className="sm:hidden">{displayLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </span>
          <span
            className="text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap hidden sm:inline"
            style={{ color: tone.kbdColor, lineHeight: 1.2 }}
          >
            · {kbd}
          </span>
        </button>
      </span>
    </>
  );
}
