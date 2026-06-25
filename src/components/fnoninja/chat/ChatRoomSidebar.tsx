"use client";

import { ImageIcon, Megaphone, MessageSquare } from "lucide-react";
import { SUBSCRIBED_CHAT_ROOMS, type ChatRoom } from "@/lib/chat/constants";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ROOM_ICONS: Record<string, typeof Megaphone> = {
  announcements: Megaphone,
  general: MessageSquare,
  "pnl-screenshots": ImageIcon,
};

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
      className="flex w-[108px] shrink-0 flex-col gap-0.5 overflow-y-auto px-2 py-2"
      style={{ borderRight: `1px solid ${FNO_NAV_BORDER}`, backgroundColor: "rgba(6,12,24,0.6)" }}
      aria-label="Chat channels"
    >
      {SUBSCRIBED_CHAT_ROOMS.map((room) => {
        const active = room.id === roomId;
        const unread = unreadByRoom[room.id] ?? 0;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom(room.id)}
            className="relative flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
            style={{
              backgroundColor: active ? "rgba(37,99,235,0.14)" : "transparent",
              border: active ? "1px solid rgba(96,165,250,0.25)" : "1px solid transparent",
            }}
            aria-current={active ? "page" : undefined}
            title={room.name}
          >
            <span className="flex w-full items-center gap-1.5">
              <RoomIcon room={room} />
              <span
                className="truncate text-[11px] font-semibold leading-tight"
                style={{ color: active ? "#e2e8f0" : "#94a3b8" }}
              >
                {room.shortName}
              </span>
              {unread > 0 ? (
                <span
                  className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                  style={{ backgroundColor: "#ef4444" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </span>
            {room.adminOnlyPost ? (
              <span className="pl-5 text-[9px] leading-none" style={{ color: "#64748b" }}>
                Read-only
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
