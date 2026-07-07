"use client";

import { MessageCircle } from "lucide-react";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";

const FLOATER_POSITION_CLASS =
  "fixed z-[170] bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] sm:bottom-6 sm:right-5";

/** Floating chat on the Market Bubbles map only. */
export function LevelsGlobalChatTrigger({
  className = "",
  variant = "floater",
}: {
  className?: string;
  variant?: "floater";
}) {
  const { open, setOpen, totalUnreadCount } = useChatPanel();
  const showBadge = !open && totalUnreadCount > 0;

  if (variant !== "floater" || open) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`${FLOATER_POSITION_CLASS} relative inline-flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors hover:brightness-110 ${className}`.trim()}
      style={{
        borderColor: "rgba(96,165,250,0.55)",
        backgroundColor: "rgba(15,23,42,0.92)",
        color: "#93c5fd",
        boxShadow:
          "0 0 0 3px rgba(96,165,250,0.12), 0 8px 24px rgba(0,0,0,0.45)",
      }}
      aria-label={showBadge ? `Community chat, ${totalUnreadCount} unread` : "Community chat"}
      title={
        showBadge ? `Community chat — ${totalUnreadCount} unread` : "Community chat"
      }
    >
      <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2} />
      {showBadge ? (
        <ChatUnreadBadge count={totalUnreadCount} className="absolute -right-1 -top-1" />
      ) : null}
    </button>
  );
}
