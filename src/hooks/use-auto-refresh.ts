"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Auto-refresh helper for one-shot Firestore hooks (useDoc/useCollection
 * after our onSnapshot removal).
 *
 * Calls every supplied `refetch` function when:
 *   - the tab becomes visible (e.g. user returns from another tab/app)
 *   - the page receives focus (covers desktop window-switching)
 *   - the polling interval fires — but ONLY while the tab is visible
 *
 * While the tab is hidden, no polling happens, so background tabs cost
 * zero Firestore reads.
 *
 * Returns:
 *   - `lastRefreshedAt`: timestamp (ms) of the most recent refresh trigger
 *   - `refresh`: manual trigger (e.g. for a "Refresh" button)
 *
 * Use `intervalMs = 0` (or null) to disable polling entirely — leaves
 * only visibility/focus refresh.
 */
export function useAutoRefresh(
  refetchFns: Array<() => void | Promise<void>>,
  intervalMs: number | null = 60_000,
): { lastRefreshedAt: number; refresh: () => void } {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(() => Date.now());

  // Keep latest refetch fns in a ref so the effect doesn't re-bind every render.
  const refetchRef = useRef(refetchFns);
  refetchRef.current = refetchFns;

  const runAll = useCallback(() => {
    setLastRefreshedAt(Date.now());
    for (const fn of refetchRef.current) {
      try {
        const r = fn();
        if (r && typeof (r as Promise<void>).catch === "function") {
          (r as Promise<void>).catch(() => {});
        }
      } catch {
        /* swallow — refetch is best-effort */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer || !intervalMs || intervalMs <= 0) return;
      timer = setInterval(runAll, intervalMs);
    };
    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runAll();
        startTimer();
      } else {
        stopTimer();
      }
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        runAll();
      }
    };

    if (document.visibilityState === "visible") startTimer();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, runAll]);

  return { lastRefreshedAt, refresh: runAll };
}

/**
 * Human-readable "X seconds/minutes ago" for the `lastRefreshedAt` value.
 * Re-computed on a 10s ticker so the label stays current without re-renders
 * caused by Firestore data changes.
 */
export function useRelativeTimeLabel(ts: number): string {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hr ago`;
}

/** Relative + clock label from an ISO timestamp (re-ticks every 10s). */
export function useIsoTimeLabel(iso: string | null | undefined): {
  relative: string;
  clock: string;
} | null {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;

  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  let relative: string;
  if (diffSec < 10) relative = "just now";
  else if (diffSec < 60) relative = `${diffSec}s ago`;
  else {
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) relative = `${diffMin} min ago`;
    else {
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 48) relative = `${diffHr} hr ago`;
      else relative = `${Math.floor(diffHr / 24)}d ago`;
    }
  }

  const clock = new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return { relative, clock };
}
