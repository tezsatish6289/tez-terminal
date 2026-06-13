"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import {
  LIVESLIDE_WALKTHROUGH_INTRO,
  LIVESLIDE_WALKTHROUGH_TOUR_STEPS,
  type LiveslideWalkthroughTourStep,
} from "@/lib/fnoninja/liveslide-walkthrough-content";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

const OVERLAY_Z = 120;

function IntroFocusBinocularIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 64"
      fill="none"
      className={className}
      aria-hidden
      style={{ color: FNO_ACCENT }}
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
function IntroAdvantageScaleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 76"
      fill="none"
      className={className}
      aria-hidden
      style={{ color: FNO_ACCENT }}
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

function tourCalloutStyle(
  rect: DOMRect | null,
  placement: LiveslideWalkthroughTourStep["placement"],
): CSSProperties {
  const pad = 12;
  const width = 320;
  if (!rect) {
    return { top: 80, left: 16, width, maxWidth: width };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerLeft = Math.max(pad, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - pad));

  if (placement === "bottom") {
    return {
      top: Math.min(rect.bottom + pad, vh - 220),
      left: centerLeft,
      width,
      maxWidth: width,
    };
  }
  if (placement === "top") {
    return {
      top: Math.max(pad + 56, rect.top - pad),
      left: centerLeft,
      width,
      maxWidth: width,
      transform: "translateY(-100%)",
    };
  }
  if (placement === "left") {
    return {
      top: Math.max(pad + 56, Math.min(rect.top, vh - 240)),
      right: Math.max(pad, vw - rect.left + pad),
      width,
      maxWidth: width,
    };
  }
  return {
    top: Math.max(pad + 56, Math.min(rect.top, vh - 240)),
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

function IntroPanel({ onNext, onClose }: { onNext: () => void; onClose: () => void }) {
  const intro = LIVESLIDE_WALKTHROUGH_INTRO;

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
              style={{ color: FNO_ACCENT }}
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
                <IntroFocusBinocularIcon className="w-[5.5rem] h-[3.75rem] sm:w-[6.5rem] sm:h-[4.25rem] opacity-35" />
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
                    <span className="shrink-0 font-bold" style={{ color: FNO_ACCENT }}>
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
                <IntroAdvantageScaleIcon className="w-[5.5rem] h-[4.75rem] sm:w-[6.75rem] sm:h-[5.75rem] opacity-35" />
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
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
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
  onNext,
  onPrev,
  onClose,
}: {
  step: LiveslideWalkthroughTourStep;
  stepIndex: number;
  totalSteps: number;
  rect: DOMRect | null;
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
            border: "2px solid rgba(96,165,250,0.95)",
            boxShadow:
              "0 0 0 3px rgba(37,99,235,0.2), 0 0 20px rgba(96,165,250,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)",
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
            border: "1px solid rgba(96,165,250,0.45)",
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: FNO_ACCENT }}
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
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
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
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"intro" | "tour">("intro");
  const [tourIndex, setTourIndex] = useState(0);
  const wasOpenRef = useRef(false);

  const tourStep = LIVESLIDE_WALKTHROUGH_TOUR_STEPS[tourIndex];
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

  if (!mounted || !isOpen) return null;

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
      <IntroPanel onNext={startTour} onClose={handleClose} />
    ) : tourStep ? (
      <TourStepPanel
        step={tourStep}
        stepIndex={tourIndex}
        totalSteps={LIVESLIDE_WALKTHROUGH_TOUR_STEPS.length}
        rect={tourRect}
        onNext={() => {
          if (tourIndex >= LIVESLIDE_WALKTHROUGH_TOUR_STEPS.length - 1) handleClose();
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
