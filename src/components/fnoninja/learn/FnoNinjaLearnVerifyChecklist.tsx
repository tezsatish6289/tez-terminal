"use client";

import { useCallback, useState } from "react";
import { Check, Circle } from "lucide-react";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

export type VerifyStep = {
  title: string;
  body: string;
};

export function FnoNinjaLearnVerifyChecklist({
  title = "Verify it yourself",
  steps,
}: {
  title?: string;
  steps: VerifyStep[];
}) {
  const [done, setDone] = useState<Set<number>>(new Set());

  const toggle = useCallback((index: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const allDone = done.size === steps.length;

  return (
    <section
      className="rounded-2xl p-6 sm:p-8"
      style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
        <span className="text-xs font-bold tabular-nums" style={{ color: "#64748b" }}>
          {done.size}/{steps.length} done
        </span>
      </div>

      {allDone ? (
        <p
          className="text-sm font-semibold mb-4 rounded-lg px-3 py-2"
          style={{ color: "#86efac", backgroundColor: "rgba(34,197,94,0.1)" }}
        >
          Nice — you know how to cross-check our data on NSE. What you do with that is entirely your
          call.
        </p>
      ) : (
        <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
          Tap each step when you&apos;ve tried it. No score — just a quick hands-on check.
        </p>
      )}

      <ul className="space-y-3">
        {steps.map((step, i) => {
          const checked = done.has(i);
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex w-full gap-3 rounded-xl p-4 text-left transition-colors"
                style={{
                  backgroundColor: checked ? "rgba(37,99,235,0.1)" : "rgba(8,15,30,0.4)",
                  border: checked
                    ? "1px solid rgba(96,165,250,0.3)"
                    : "1px solid rgba(90,140,220,0.12)",
                }}
              >
                <span className="shrink-0 mt-0.5">
                  {checked ? (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(34,197,94,0.2)", color: "#86efac" }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ border: "2px solid rgba(100,116,139,0.4)", color: "#64748b" }}
                    >
                      <Circle className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-sm font-bold mb-1"
                    style={{ color: checked ? "#e2e8f0" : "#f8fafc" }}
                  >
                    {i + 1}. {step.title}
                  </span>
                  <span
                    className="block text-sm leading-relaxed"
                    style={{ color: checked ? "#94a3b8" : "#64748b" }}
                  >
                    {step.body}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {done.size > 0 && !allDone ? (
        <button
          type="button"
          onClick={() => setDone(new Set())}
          className="mt-4 text-xs font-semibold hover:underline"
          style={{ color: FNO_ACCENT }}
        >
          Reset checklist
        </button>
      ) : null}
    </section>
  );
}
