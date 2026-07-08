"use client";

import { MessageCircle } from "lucide-react";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";

/** Above bubble physics layers (max z ~240). */
const FLOATER_Z_CLASS = "z-[280]";

/** Bottom-right overlay on the bubble chart canvas (parent must be `relative`). */
const FLOATER_POSITION_CLASS =
  `absolute ${FLOATER_Z_CLASS} bottom-4 right-4 sm:bottom-5 sm:right-5 touch-manipulation pointer-events-auto`;

/** 56×56px minimum touch target (WCAG-friendly). */
const FLOATER_HIT_CLASS =
  "inline-flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full border-2";

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
      className={`${FLOATER_POSITION_CLASS} ${FLOATER_HIT_CLASS} relative transition-colors hover:brightness-110 active:scale-95 ${className}`.trim()}
      style={{
        borderColor: "rgba(96,165,250,0.65)",
        backgroundColor: "rgba(15,23,42,0.96)",
        color: "#93c5fd",
        boxShadow:
          "0 0 0 3px rgba(96,165,250,0.22), 0 10px 28px rgba(0,0,0,0.55)",
      }}
      aria-label={showBadge ? `Community chat, ${totalUnreadCount} unread` : "Community chat"}
      title={
        showBadge ? `Community chat — ${totalUnreadCount} unread` : "Community chat"
      }
    >
      <MessageCircle className="h-6 w-6 shrink-0" strokeWidth={2} />
      {showBadge ? (
        <ChatUnreadBadge count={totalUnreadCount} className="absolute -right-0.5 -top-0.5" />
      ) : null}
    </button>
  );
}
