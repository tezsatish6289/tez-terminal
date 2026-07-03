"use client";

import { useEffect } from "react";

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

/** C → chart, O → outlook, H → history, P → PVT (when available). */
export function useChartOutlookKeyboardShortcuts(
  outlookAvailable: boolean,
  onChart: () => void,
  onOutlook: () => void,
  enabled = true,
  opts?: {
    historyAvailable?: boolean;
    onHistory?: () => void;
    pvtAvailable?: boolean;
    onPvt?: () => void;
  },
) {
  const historyAvailable = opts?.historyAvailable ?? false;
  const onHistory = opts?.onHistory;
  const pvtAvailable = opts?.pvtAvailable ?? false;
  const onPvt = opts?.onPvt;
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        onChart();
        return;
      }
      if ((e.key === "o" || e.key === "O") && outlookAvailable) {
        e.preventDefault();
        onOutlook();
        return;
      }
      if ((e.key === "h" || e.key === "H") && historyAvailable && onHistory) {
        e.preventDefault();
        onHistory();
        return;
      }
      if ((e.key === "p" || e.key === "P") && pvtAvailable && onPvt) {
        e.preventDefault();
        onPvt();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [outlookAvailable, onChart, onOutlook, enabled, historyAvailable, onHistory, pvtAvailable, onPvt]);
}
