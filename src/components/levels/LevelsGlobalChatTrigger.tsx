"use client";

import { MessageCircle } from "lucide-react";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** Global community chat — lives above the PVT panel (or chart corner on other views). */
export function LevelsGlobalChatTrigger({ className = "" }: { className?: string }) {
  const { open, setOpen, unreadCount } = useChatPanel();
  const chatUnread = unreadCount && !open;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`relative inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 transition-all hover:brightness-110 ${className}`.trim()}
      style={{
        borderColor: open ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.14)",
        backgroundColor: open ? "rgba(37,99,235,0.16)" : "rgba(255,255,255,0.04)",
        color: open ? FNO_ACCENT : "#94a3b8",
        boxShadow: open
          ? "0 0 18px rgba(96,165,250,0.28), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 0 12px rgba(96,165,250,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
      aria-label={chatUnread ? "Community chat, new messages" : "Community chat"}
      title={chatUnread ? "Community chat — new messages" : "Community chat"}
    >
      <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={1.75} />
      <span className="text-[11px] font-semibold leading-none">Chat</span>
      {chatUnread ? (
        <span
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: FNO_ACCENT,
            boxShadow: "0 0 0 2px rgba(8,15,30,0.95)",
          }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}
