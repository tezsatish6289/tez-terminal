"use client";

import { MessageCircle, Play } from "lucide-react";
import type { ParsedSuccessStoryMessage } from "@/lib/chat/success-story-message";

const QUICK_REACT = ["🔥", "👀", "🎯", "📈"] as const;

/**
 * Rich win card for Success Stories — replaces the plain spreadsheet-style text.
 */
export function SuccessStoryChatCard({
  parsed,
  canReply,
  canReact,
  onWatch,
  onReply,
  onReact,
}: {
  parsed: ParsedSuccessStoryMessage;
  canReply: boolean;
  canReact: boolean;
  onWatch: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const setup =
    parsed.sideHint === "support"
      ? "Put-wall bounce"
      : parsed.sideHint === "resistance"
        ? "Call-wall rejection"
        : "Wall → max pain";

  return (
    <div
      className="mt-1.5 overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(74,222,128,0.28)",
        background:
          "linear-gradient(145deg, rgba(16,42,28,0.55) 0%, rgba(13,24,48,0.95) 48%, rgba(13,24,48,0.98) 100%)",
      }}
    >
      <div
        className="h-1 w-full"
        style={{ background: "linear-gradient(90deg, #22c55e, #4ade80, #60a5fa)" }}
      />
      <div className="px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/90">
          Just hit · {setup}
        </p>
        <div className="mt-1.5 flex items-end gap-2">
          <p className="text-lg font-black tracking-tight text-white">${parsed.symbol}</p>
          {parsed.movePct ? (
            <p className="pb-0.5 text-xl font-black leading-none text-emerald-400">
              +{parsed.movePct}%
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] leading-snug text-slate-400">
          Ran to max pain. Educational recap — not investment advice.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1d4ed8]"
          >
            <Play className="h-3 w-3 fill-current" />
            Watch replay
          </button>
          {canReply ? (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
              style={{ border: "1px solid rgba(148,163,184,0.35)" }}
            >
              <MessageCircle className="h-3 w-3" />
              Reply
            </button>
          ) : null}
        </div>

        {canReact ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-500">React:</span>
            {QUICK_REACT.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className="rounded-full px-2 py-0.5 text-sm transition-colors hover:bg-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
