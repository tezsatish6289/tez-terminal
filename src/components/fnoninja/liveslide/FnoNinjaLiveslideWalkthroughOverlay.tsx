"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import {
  LIVESLIDE_WALKTHROUGH_INTRO,
  LIVESLIDE_WALKTHROUGH_TOUR_STEPS,
  type LiveslideWalkthroughTourStep,
} from "@/lib/fnoninja/liveslide-walkthrough-content";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

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
    measure();
    if (!enabled) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    const id = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [enabled, measure]);

  return rect;
}

function IntroPanel({ onNext, onClose }: { onNext: () => void; onClose: () => void }) {
  const intro = LIVESLIDE_WALKTHROUGH_INTRO;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col pointer-events-auto">
      {/* Light scrim — Liveslide stays visible around the guide */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: "rgba(8,15,30,0.42)" }}
        aria-hidden
      />

      <div className="relative flex flex-col h-dvh max-h-dvh min-h-0 w-full">
        <div className="shrink-0 flex items-center justify-end px-4 sm:px-6 py-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
            style={{ color: "#94a3b8", backgroundColor: "rgba(8,15,30,0.55)" }}
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

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4 overflow-y-auto">
            <section
              className="rounded-xl p-4 sm:p-5 min-h-0 overflow-hidden"
              style={{ backgroundColor: "rgba(8,15,30,0.88)", border: FNO_CARD_BORDER }}
            >
              <h2 className="text-base sm:text-lg font-bold text-white mb-2.5">Purpose</h2>
              <div className="space-y-2.5 text-[13px] sm:text-sm leading-snug text-slate-300">
                {intro.purpose.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>

            <section
              className="rounded-xl p-4 sm:p-5 min-h-0 overflow-hidden"
              style={{ backgroundColor: "rgba(8,15,30,0.88)", border: FNO_CARD_BORDER }}
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
            </section>
          </div>

          <footer
            className="shrink-0 flex items-center justify-center sm:justify-start pt-3 pb-1 border-t"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
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

  const calloutTop =
    step.placement === "top" && rect
      ? Math.max(16, rect.top - 12)
      : step.placement === "bottom" && rect
        ? Math.min(window.innerHeight - 180, rect.bottom + 12)
        : undefined;

  return (
    <>
      <div className="fixed inset-0 z-[115] bg-[rgba(8,15,30,0.18)] pointer-events-none" aria-hidden />

      {rect ? (
        <div
          className="fixed z-[116] rounded-lg pointer-events-none transition-all duration-300 ease-out"
          style={{
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
        className="fixed z-[117] left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm pointer-events-auto"
        style={{
          top: calloutTop,
          bottom: step.placement === "top" || step.placement === "bottom" ? undefined : 24,
          transform: step.placement === "top" && rect ? "translateY(-100%)" : undefined,
        }}
      >
        <div
          className="rounded-xl p-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(8,15,30,0.97)",
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

  const tourStep = LIVESLIDE_WALKTHROUGH_TOUR_STEPS[tourIndex];
  const tourRect = useViewportTargetRect(
    tourStep?.selector ?? "",
    isOpen && phase === "tour" && Boolean(tourStep),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPhase("intro");
    setTourIndex(0);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const handleClose = () => {
    document.body.style.overflow = "";
    onClose();
  };

  return createPortal(
    phase === "intro" ? (
      <IntroPanel
        onNext={() => setPhase("tour")}
        onClose={handleClose}
      />
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
