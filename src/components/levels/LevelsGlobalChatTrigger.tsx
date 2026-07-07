"use client";

import { MessageCircle } from "lucide-react";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** Floating chat on the Market Bubbles map only. */
export function LevelsGlobalChatTrigger({
  className = "",
  variant = "floater",
}: {
  className?: string;
  variant?: "floater";
}) {
  const { open, setOpen, unreadCount } = useChatPanel();
  const chatUnread = unreadCount && !open;

  if (variant !== "floater") return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors hover:brightness-110 ${className}`.trim()}
      style={{
        borderColor: open ? FNO_ACCENT : "rgba(96,165,250,0.55)",
        backgroundColor: open ? "rgba(37,99,235,0.22)" : "rgba(15,23,42,0.92)",
        color: open ? FNO_ACCENT : "#93c5fd",
        boxShadow: open
          ? "0 0 0 3px rgba(96,165,250,0.18), 0 4px 14px rgba(0,0,0,0.45)"
          : "0 0 0 3px rgba(96,165,250,0.12), 0 4px 14px rgba(0,0,0,0.4)",
      }}
      aria-label={chatUnread ? "Community chat, new messages" : "Community chat"}
      title={chatUnread ? "Community chat — new messages" : "Community chat"}
    >
      <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2} />
      {chatUnread ? (
        <span
          className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: FNO_ACCENT,
            boxShadow: "0 0 0 2px rgba(15,23,42,0.95)",
          }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}
