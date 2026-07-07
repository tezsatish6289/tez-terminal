"use client";

import { CHAT_EMOJIS } from "@/lib/chat/constants";

/** Shared emoji grid for composer inserts and message reactions. */
export function ChatEmojiGrid({
  onPick,
  className = "",
  cols = 8,
}: {
  onPick: (emoji: string) => void;
  className?: string;
  cols?: 6 | 8;
}) {
  return (
    <div
      className={`grid gap-0.5 rounded-xl p-2 shadow-2xl ${cols === 8 ? "grid-cols-8" : "grid-cols-6"} ${className}`.trim()}
      style={{
        backgroundColor: "rgba(12,18,30,0.99)",
        border: "1px solid rgba(90,140,220,0.22)",
      }}
      role="listbox"
      aria-label="Choose emoji"
    >
      {CHAT_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="option"
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-white/10"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(emoji);
          }}
          aria-label={`${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
