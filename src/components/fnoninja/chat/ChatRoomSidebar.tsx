"use client";

import { ImageIcon, Megaphone, MessageSquare } from "lucide-react";
import { SUBSCRIBED_CHAT_ROOMS, type ChatRoom } from "@/lib/chat/constants";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ROOM_ICONS: Record<string, typeof Megaphone> = {
  announcements: Megaphone,
  general: MessageSquare,
  "pnl-screenshots": ImageIcon,
};

const UNREAD_DOT_COLOR = "#60a5fa";

interface ChatRoomSidebarProps {
  roomId: string;
  onSelectRoom: (roomId: string) => void;
  unreadByRoom: Record<string, number>;
}

function RoomIcon({ room }: { room: ChatRoom }) {
  const Icon = ROOM_ICONS[room.id] ?? MessageSquare;
  return <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />;
}

export function ChatRoomSidebar({ roomId, onSelectRoom, unreadByRoom }: ChatRoomSidebarProps) {
  return (
    <nav
      className="flex w-[128px] shrink-0 flex-col gap-1 overflow-y-auto px-2 py-2"
      style={{ borderRight: `1px solid ${FNO_NAV_BORDER}`, backgroundColor: "rgba(6,12,24,0.6)" }}
      aria-label="Chat channels"
    >
      {SUBSCRIBED_CHAT_ROOMS.map((room) => {
        const active = room.id === roomId;
        const hasUnread = (unreadByRoom[room.id] ?? 0) > 0;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom(room.id)}
            className="relative flex w-full flex-col items-start gap-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
            style={{
              backgroundColor: active ? "rgba(37,99,235,0.14)" : "transparent",
              border: active ? "1px solid rgba(96,165,250,0.25)" : "1px solid transparent",
            }}
            aria-current={active ? "page" : undefined}
            aria-label={
              hasUnread ? `${room.name}, new messages` : room.name
            }
          >
            {hasUnread ? (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full"
                style={{
                  backgroundColor: UNREAD_DOT_COLOR,
                  boxShadow: "0 0 0 2px rgba(6,12,24,0.9)",
                }}
                aria-hidden
              />
            ) : null}
            <RoomIcon room={room} />
            <span
              className="w-full break-words text-[10px] font-semibold leading-snug"
              style={{ color: active ? "#e2e8f0" : "#94a3b8" }}
            >
              {room.name}
            </span>
            {room.adminOnlyPost ? (
              <span className="text-[9px] leading-none" style={{ color: "#64748b" }}>
                Read-only
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
