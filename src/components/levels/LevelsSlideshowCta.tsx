"use client";

import { useEffect, useId, useRef, useState } from "react";

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

export function LevelsSlideshowCta({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
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
        style={{ padding: BORDER_PAD }}
      >
        {box.w > 4 && box.h > 4 ? (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={box.w}
            height={box.h}
            viewBox={`0 0 ${box.w} ${box.h}`}
            aria-hidden
          >
            <defs>
              <filter id={`levels-cta-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect
              x={BORDER_INSET}
              y={BORDER_INSET}
              width={rw}
              height={rh}
              rx={rx}
              ry={rx}
              fill="none"
              stroke="rgba(125, 211, 252, 0.35)"
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
              stroke="#e0f2fe"
              strokeWidth={2.25}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="11 89"
              style={{
                animation: "levels-cta-border-run 2.1s linear infinite",
                filter: `url(#levels-cta-glow-${uid})`,
              }}
            />
            <rect
              x={BORDER_INSET}
              y={BORDER_INSET}
              width={rw}
              height={rh}
              rx={rx}
              ry={rx}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.75}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="7 93"
              style={{
                animation: "levels-cta-border-run 2.1s linear infinite",
                animationDelay: "-0.35s",
                opacity: 0.85,
              }}
            />
          </svg>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          title={title}
          className={`relative z-[1] inline-flex items-center gap-1.5 px-4 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full transition-all hover:brightness-110 active:scale-[0.98]`}
          style={{
            background:
              "linear-gradient(180deg, #60a5fa 0%, #3b82f6 38%, #2563eb 72%, #1d4ed8 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(29,78,216,0.5), 0 0 32px rgba(59,130,246,0.85), 0 8px 28px rgba(37,99,235,0.55)",
          }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
            style={{ color: "#ffffff", lineHeight: 1.2, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
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
