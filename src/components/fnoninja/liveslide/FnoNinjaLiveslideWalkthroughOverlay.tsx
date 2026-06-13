"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import {
  LIVESLIDE_WALKTHROUGH_INTRO,
  LIVESLIDE_WALKTHROUGH_TOUR_STEPS,
  type LiveslideWalkthroughTourStep,
} from "@/lib/fnoninja/liveslide-walkthrough-content";
import {
  FAVSLIDE_WALKTHROUGH_INTRO,
  FAVSLIDE_WALKTHROUGH_TOUR_STEPS,
} from "@/lib/fnoninja/favslide-walkthrough-content";
import type { FnoNinjaLevelsViewMode } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";
import { FNO_NAV_CLEARANCE_PX } from "@/lib/fnoninja/responsive";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER, FNO_FAVSLIDE_ACCENT } from "@/lib/fnoninja/theme";

/** Above fixed nav (z-200) so tour callouts are not clipped by the header strip. */
const OVERLAY_Z = 250;

const CALLOUT_EST_HEIGHT = 200;

function IntroStarWatchlistIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 88 76" fill="none" className={className} aria-hidden style={{ color }}>
      <path
        d="M44 12l7.2 14.6 16.1 2.3-11.6 11.3 2.7 16L44 48.8 29.6 56.2l2.7-16L20.7 28.9l16.1-2.3L44 12z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
      <rect x="14" y="58" width="60" height="8" rx="2" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <path d="M22 66v4M66 66v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function walkthroughConfig(mode: "liveslide" | "favslide") {
  if (mode === "favslide") {
    return {
      intro: FAVSLIDE_WALKTHROUGH_INTRO,
      steps: FAVSLIDE_WALKTHROUGH_TOUR_STEPS,
      accent: FNO_FAVSLIDE_ACCENT,
      highlightBorder: "rgba(251,191,36,0.95)",
      highlightGlow: "0 0 0 3px rgba(251,191,36,0.2), 0 0 20px rgba(251,191,36,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)",
      calloutBorder: "1px solid rgba(251,191,36,0.45)",
    };
  }
  return {
    intro: LIVESLIDE_WALKTHROUGH_INTRO,
    steps: LIVESLIDE_WALKTHROUGH_TOUR_STEPS,
    accent: FNO_ACCENT,
    highlightBorder: "rgba(96,165,250,0.95)",
    highlightGlow:
      "0 0 0 3px rgba(37,99,235,0.2), 0 0 20px rgba(96,165,250,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)",
    calloutBorder: "1px solid rgba(96,165,250,0.45)",
  };
}

function IntroFocusBinocularIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg
      viewBox="0 0 96 64"
      fill="none"
      className={className}
      aria-hidden
      style={{ color }}
    >
      <path
        d="M12 38c0-9.941 8.059-18 18-18 4.2 0 8.06 1.44 11.12 3.86C44.18 21.4 48.04 20 52.24 20 62.18 20 70.24 28.06 70.24 38"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="30" cy="38" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="30" cy="38" r="7" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <circle cx="52.24" cy="38" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="52.24" cy="38" r="7" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <path d="M44.24 38h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M18 24l-4-8M78 24l4-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

/** Manual balance scale — beam tilted right (advantage side heavier). */
function IntroAdvantageScaleIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg
      viewBox="0 0 88 76"
      fill="none"
      className={className}
      aria-hidden
      style={{ color }}
    >
      <path d="M44 10v38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="44" cy="8" r="3" fill="currentColor" opacity="0.65" />
      <g transform="rotate(16 44 28)">
        <path d="M14 28h60" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M18 28v6M70 28v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8 40c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M54 44c0-7 5-12 12-12s12 5 12 12-5 12-12 12-12-5-12-12z"
          stroke="currentColor"
          strokeWidth="2.25"
        />
        <path d="M58 48h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity="0.5" />
      </g>
      <rect x="30" y="50" width="28" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M36 55v7M52 55v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 62h32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function navClearancePx() {
  const nav = document.querySelector("body > nav.fixed");
  if (nav) {
    return Math.ceil(nav.getBoundingClientRect().height) + 8;
  }
  return FNO_NAV_CLEARANCE_PX;
}

function tourCalloutStyle(
  rect: DOMRect | null,
  placement: LiveslideWalkthroughTourStep["placement"],
): CSSProperties {
  const pad = 12;
  const width = 320;
  const navClear = navClearancePx();
  if (!rect) {
    return { top: navClear + 16, left: 16, width, maxWidth: width };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerLeft = Math.max(pad, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - pad));

  if (placement === "bottom") {
    return {
      top: Math.max(navClear, Math.min(rect.bottom + pad, vh - 220)),
      left: centerLeft,
      width,
      maxWidth: width,
    };
  }
  if (placement === "top") {
    const idealBottom = rect.top - pad;
    const minBottom = navClear + CALLOUT_EST_HEIGHT;
    return {
      top: Math.max(minBottom, idealBottom),
      left: centerLeft,
      width,
      maxWidth: width,
      transform: "translateY(-100%)",
    };
  }
  if (placement === "left") {
    return {
      top: Math.max(navClear, Math.min(rect.top, vh - 240)),
      right: Math.max(pad, vw - rect.left + pad),
      width,
      maxWidth: width,
    };
  }
  return {
    top: Math.max(navClear, Math.min(rect.top, vh - 240)),
    left: Math.min(rect.right + pad, vw - width - pad),
    width,
    maxWidth: width,
  };
}

function useViewportTargetRect(selector: string, enabled: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!enabled) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [enabled, selector]);

  useEffect(() => {
    if (!enabled) {
      setRect(null);
      return;
    }
    measure();
    const el = document.querySelector(selector);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (el) ro.observe(el);
    const id = window.setInterval(measure, 150);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [enabled, measure, selector]);

  return rect;
}

function IntroPanel({
  mode,
  onNext,
  onClose,
}: {
  mode: "liveslide" | "favslide";
  onNext: () => void;
  onClose: () => void;
}) {
  const { intro, accent } = walkthroughConfig(mode);
  const isFav = mode === "favslide";

  return (
    <div
      className="fixed inset-0 flex flex-col pointer-events-auto"
      style={{ zIndex: OVERLAY_Z, backgroundColor: "rgba(8,15,30,0.94)" }}
    >
      <div className="relative flex flex-col h-dvh max-h-dvh min-h-0 w-full">
        <div className="shrink-0 flex items-center justify-end px-4 sm:px-6 py-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
            style={{ color: "#94a3b8", backgroundColor: "rgba(15,23,42,0.8)" }}
            aria-label="Close guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col px-4 sm:px-6 lg:px-10 pb-4 sm:pb-5 w-full">
          <header className="shrink-0 mb-3 sm:mb-4">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1.5"
              style={{ color: accent }}
            >
              Product guide
            </p>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-[1.12]">
                {intro.title}
              </h1>
              <div
                className="flex items-center gap-1.5 text-xs shrink-0"
                style={{ color: "#64748b" }}
              >
                <Clock className="h-3.5 w-3.5" />
                {intro.readLabel}
              </div>
            </div>
            <p
              className="mt-2 text-sm sm:text-[15px] leading-snug max-w-[72rem]"
              style={{ color: "#94a3b8" }}
            >
              {intro.excerpt}
            </p>
          </header>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4 overflow-y-auto items-stretch">
            <section
              className="rounded-xl p-4 sm:p-5 min-h-0 flex flex-col h-full"
              style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
            >
              <h2 className="text-base sm:text-lg font-bold text-white mb-2.5">Purpose</h2>
              <div className="space-y-2.5 text-[13px] sm:text-sm leading-snug text-slate-300">
                {intro.purpose.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              <div
                className="flex-1 flex items-end justify-center pt-4 sm:pt-6 min-h-[5.5rem]"
                aria-hidden
              >
                {isFav ? (
                  <IntroStarWatchlistIcon
                    color={accent}
                    className="w-[5.5rem] h-[4.75rem] sm:w-[6.5rem] sm:h-[5.5rem] opacity-35"
                  />
                ) : (
                  <IntroFocusBinocularIcon
                    color={accent}
                    className="w-[5.5rem] h-[3.75rem] sm:w-[6.5rem] sm:h-[4.25rem] opacity-35"
                  />
                )}
              </div>
            </section>

            <section
              className="rounded-xl p-4 sm:p-5 min-h-0 flex flex-col h-full"
              style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
            >
              <h2 className="text-base sm:text-lg font-bold text-white mb-2.5">The advantage</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2">
                {intro.advantages.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-[13px] sm:text-sm leading-snug"
                    style={{ color: "#94a3b8" }}
                  >
                    <span className="shrink-0 font-bold" style={{ color: accent }}>
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div
                className="flex-1 flex items-end justify-end pt-4 sm:pt-6 min-h-[5.5rem] pr-1 sm:pr-3"
                aria-hidden
              >
                <IntroAdvantageScaleIcon
                  color={accent}
                  className="w-[5.5rem] h-[4.75rem] sm:w-[6.75rem] sm:h-[5.75rem] opacity-35"
                />
              </div>
            </section>
          </div>

          <footer
            className="shrink-0 flex items-center justify-center sm:justify-start pt-3 pb-1 border-t"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg px-8 py-3 text-sm font-bold text-white shadow-lg"
              style={{
                background: isFav
                  ? "linear-gradient(135deg, #d97706, #fbbf24)"
                  : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              }}
            >
              Next — tour the controls
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function TourStepPanel({
  step,
  stepIndex,
  totalSteps,
  rect,
  accent,
  highlightBorder,
  highlightGlow,
  calloutBorder,
  onNext,
  onPrev,
  onClose,
}: {
  step: LiveslideWalkthroughTourStep;
  stepIndex: number;
  totalSteps: number;
  rect: DOMRect | null;
  accent: string;
  highlightBorder: string;
  highlightGlow: string;
  calloutBorder: string;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const isLast = stepIndex >= totalSteps - 1;
  const calloutStyle = tourCalloutStyle(rect, step.placement);

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: OVERLAY_Z, backgroundColor: "rgba(8,15,30,0.35)" }}
        aria-hidden
      />

      {rect ? (
        <div
          className="fixed rounded-lg pointer-events-none transition-all duration-300 ease-out"
          style={{
            zIndex: OVERLAY_Z + 1,
            left: rect.left - 3,
            top: rect.top - 3,
            width: rect.width + 6,
            height: rect.height + 6,
            border: `2px solid ${highlightBorder}`,
            boxShadow: highlightGlow,
          }}
        />
      ) : null}

      <div
        className="fixed pointer-events-auto"
        style={{ zIndex: OVERLAY_Z + 2, ...calloutStyle }}
      >
        <div
          className="rounded-xl p-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(8,15,30,0.98)",
            border: calloutBorder,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: accent }}
            >
              {stepIndex + 1} of {totalSteps}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-1 rounded hover:bg-white/5"
              style={{ color: "#64748b" }}
              aria-label="Close guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm font-bold text-white mb-1.5">{step.title}</p>
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
            {step.body}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.35)" }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
              style={{
                background:
                  accent === FNO_FAVSLIDE_ACCENT
                    ? "linear-gradient(135deg, #d97706, #fbbf24)"
                    : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              }}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function FnoNinjaLiveslideWalkthroughOverlay({
  isOpen,
  onClose,
  mode,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode: FnoNinjaLevelsViewMode;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"intro" | "tour">("intro");
  const [tourIndex, setTourIndex] = useState(0);
  const wasOpenRef = useRef(false);

  const slideshowMode = mode === "favslide" ? "favslide" : "liveslide";
  const config = walkthroughConfig(slideshowMode);
  const tourStep = config.steps[tourIndex];
  const tourRect = useViewportTargetRect(
    tourStep?.selector ?? "",
    isOpen && phase === "tour" && Boolean(tourStep),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setPhase("intro");
      setTourIndex(0);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || phase !== "tour" || !tourStep) return;
    const el = document.querySelector(tourStep.selector);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [isOpen, phase, tourStep]);

  if (!mounted || !isOpen || mode === "bubbles") return null;

  const handleClose = () => {
    document.body.style.overflow = "";
    onClose();
  };

  const startTour = () => {
    setTourIndex(0);
    setPhase("tour");
  };

  return createPortal(
    phase === "intro" ? (
      <IntroPanel mode={slideshowMode} onNext={startTour} onClose={handleClose} />
    ) : tourStep ? (
      <TourStepPanel
        step={tourStep}
        stepIndex={tourIndex}
        totalSteps={config.steps.length}
        rect={tourRect}
        accent={config.accent}
        highlightBorder={config.highlightBorder}
        highlightGlow={config.highlightGlow}
        calloutBorder={config.calloutBorder}
        onNext={() => {
          if (tourIndex >= config.steps.length - 1) handleClose();
          else setTourIndex((i) => i + 1);
        }}
        onPrev={() => {
          if (tourIndex <= 0) setPhase("intro");
          else setTourIndex((i) => i - 1);
        }}
        onClose={handleClose}
      />
    ) : null,
    document.body,
  );
}
