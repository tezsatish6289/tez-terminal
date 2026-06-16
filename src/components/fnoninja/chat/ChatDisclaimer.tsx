"use client";

import { AlertTriangle } from "lucide-react";

/** Sticky reminder above the composer — chat is opinions, not advice. */
export function ChatDisclaimer() {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 text-[11px] leading-snug"
      style={{
        backgroundColor: "rgba(251,191,36,0.08)",
        borderTop: "1px solid rgba(251,191,36,0.15)",
        color: "#fbbf24",
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
