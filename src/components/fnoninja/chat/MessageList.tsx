"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { MessageItem } from "@/components/fnoninja/chat/MessageItem";
import type { ChatMessage } from "@/lib/chat/types";

interface MessageListProps {
  messages: ChatMessage[];
  currentUid: string;
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (message: ChatMessage) => void;
}

export function MessageList({
  messages,
  currentUid,
  loading,
  hasMore,
  loadingOlder,
  loadOlder,
  onEdit,
  onDelete,
  onReport,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // Auto-scroll to bottom when new messages arrive and the user is already near
  // the bottom (don't yank them up if they're reading history).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (grew && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs" style={{ color: "#475569" }}>
        No messages yet. Start the conversation.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
      {hasMore ? (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors hover:text-white disabled:opacity-50"
            style={{ color: "#64748b", border: "1px solid rgba(90,140,220,0.15)" }}
          >
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        </div>
      ) : null}

      {messages.map((m) => (
        <MessageItem
          key={m.id}
          message={m}
          isOwn={m.authorId === currentUid}
          onEdit={onEdit}
          onDelete={onDelete}
          onReport={onReport}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
