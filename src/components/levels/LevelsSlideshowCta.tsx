"use client";

import { useEffect, useRef, useState } from "react";

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

/** Matte interior; border runner + outer halo share this accent (no inner bloom). */
const CTA_FILL = "#1d4ed8";
const CTA_ACCENT = "#60a5fa";
const CTA_ACCENT_RGB = "96, 165, 250";
const CTA_ACCENT_DIM = `rgba(${CTA_ACCENT_RGB}, 0.4)`;
const CTA_ACCENT_MID = `rgba(${CTA_ACCENT_RGB}, 0.75)`;

export function LevelsSlideshowCta({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}) {
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
          boxShadow: `0 0 12px rgba(${CTA_ACCENT_RGB}, 0.7), 0 0 28px rgba(${CTA_ACCENT_RGB}, 0.45), 0 0 48px rgba(${CTA_ACCENT_RGB}, 0.22)`,
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
              stroke={CTA_ACCENT_DIM}
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
              stroke={CTA_ACCENT}
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
              stroke={CTA_ACCENT_MID}
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
          className={`relative z-[1] inline-flex items-center gap-1.5 px-4 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full transition-all hover:brightness-[1.06] active:scale-[0.98]`}
          style={{
            background: CTA_FILL,
            border: `1px solid ${CTA_ACCENT}`,
            boxShadow: "none",
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
            {label}
          </span>
          <span
            className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap hidden sm:inline"
            style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.2 }}
          >
            · S
          </span>
        </button>
      </span>
    </>
  );
}
