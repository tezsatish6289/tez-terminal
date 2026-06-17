"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { MessageItem } from "@/components/fnoninja/chat/MessageItem";
import type { ChatMessage } from "@/lib/chat/types";

const NEAR_BOTTOM_PX = 160;

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
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onReply: (message: ChatMessage) => void;
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
  onRetry,
  onDiscard,
  onReply,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  // Scroll to (and briefly highlight) a message by id — used when tapping a
  // reply quote to see the original in context.
  const jumpToMessage = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 1800);
  }, []);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowJump(false);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom) setShowJump(false);
  };

  // When new messages arrive: auto-scroll if the user is already near the bottom;
  // otherwise surface a "New messages" pill instead of yanking them down.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (!grew) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setShowJump(true);
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
    <div className="relative flex flex-1 flex-col min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2">
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
            onRetry={onRetry}
            onDiscard={onDiscard}
            onReply={onReply}
            onJumpTo={jumpToMessage}
            highlight={m.id === highlightId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg transition-transform hover:scale-105"
          style={{ backgroundColor: "#2563eb", boxShadow: "0 4px 14px rgba(37,99,235,0.45)" }}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          New messages
        </button>
      ) : null}
    </div>
  );
}
