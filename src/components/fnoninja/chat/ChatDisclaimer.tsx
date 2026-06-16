"use client";

import { AlertTriangle } from "lucide-react";

/** Sticky reminder above the composer — chat is opinions, not advice. */
export function ChatDisclaimer() {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 text-[11px] leading-snug"
      style={{
        backgroundColor: "rgba(148,163,184,0.06)",
        borderTop: "1px solid rgba(148,163,184,0.14)",
        color: "#94a3b8",
      }}
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        User opinions only — <strong>not investment advice</strong>. Do not post buy/sell calls or
        tips.
      </span>
    </div>
  );
}
