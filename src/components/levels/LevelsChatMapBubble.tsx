"use client";

import { type RefObject } from "react";
import { MessageCircle } from "lucide-react";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FNO_ACCENT, FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

/** Community chat as a distinct brand-blue bubble on the market map. */
export function LevelsChatMapBubble({
  bubbleRef,
  pin,
}: {
  bubbleRef: RefObject<HTMLDivElement | null>;
  /** Bottom-right anchor — set on first paint so the bubble never flashes top-left. */
  pin: { x: number; y: number; r: number };
}) {
  const { open, setOpen, totalUnreadCount } = useChatPanel();
  const showBadge = !open && totalUnreadCount > 0;

  if (open) return null;

  const d = pin.r * 2;

  return (
    <div
      ref={bubbleRef}
      className="absolute left-0 top-0 will-change-transform pointer-events-auto"
      style={{
        width: d,
        height: d,
        zIndex: 300,
        transform: `translate3d(${pin.x - pin.r}px, ${pin.y - pin.r}px, 0)`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-full hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:scale-[0.97] cursor-pointer touch-manipulation"
        style={{
          background: FNO_CTA_GRADIENT,
          border: `3px solid ${FNO_ACCENT}`,
          boxShadow: `${FNO_CTA_SHADOW}, 0 0 24px rgba(96,165,250,0.45), inset 0 0 14px rgba(147,197,253,0.22)`,
        }}
        aria-label={showBadge ? `Community chat, ${totalUnreadCount} unread` : "Community chat"}
        title={
          showBadge ? `Community chat — ${totalUnreadCount} unread` : "Community chat"
        }
      >
        <MessageCircle
          className="shrink-0 pointer-events-none"
          style={{ width: 22, height: 22, color: "#eff6ff" }}
          strokeWidth={2.25}
        />
        <span
          className="font-black leading-none tracking-tight pointer-events-none"
          style={{ fontSize: 11, color: "#eff6ff" }}
        >
          Chat
        </span>
        {showBadge ? (
          <ChatUnreadBadge
            count={totalUnreadCount}
            className="absolute -right-0.5 -top-0.5"
          />
        ) : null}
      </button>
    </div>
  );
}
