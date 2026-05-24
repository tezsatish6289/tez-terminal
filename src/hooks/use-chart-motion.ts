"use client";

import { useEffect, useState } from "react";

/** Default Recharts enter animation length (ms). */
export const CHART_ANIM_MS = 750;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useChartMotion() {
  const reduced = usePrefersReducedMotion();
  return {
    enabled: !reduced,
    duration: reduced ? 0 : CHART_ANIM_MS,
    /** Fade bar/line labels in after bars finish growing */
    labelDelay: reduced ? 0 : CHART_ANIM_MS + 80,
  };
}

/** Count up to `target` on mount / when target changes. */
export function useAnimatedNumber(
  target: number,
  options?: { duration?: number; enabled?: boolean },
) {
  const duration = options?.duration ?? CHART_ANIM_MS;
  const enabled = options?.enabled ?? true;
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled || duration <= 0) {
      setValue(target);
      return;
    }

    let start: number | null = null;
    let frame = 0;

    const step = (ts: number) => {
      if (start == null) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else setValue(target);
    };

    setValue(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, enabled]);

  return value;
}
