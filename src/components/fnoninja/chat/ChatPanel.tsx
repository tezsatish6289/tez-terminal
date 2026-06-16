"use client";

import { useMemo, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { useUser } from "@/firebase";
import { useSubscription } from "@/hooks/use-subscription";
import { useChatMember } from "@/hooks/use-chat-member";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { toast } from "@/hooks/use-toast";
import {
  deleteChatMessage,
  editChatMessage,
  reportChatMessage,
  sendChatMessage,
} from "@/lib/chat/client";
import { CHAT_ROOMS } from "@/lib/chat/constants";
import type { ChatMessage } from "@/lib/chat/types";
import { FNO_BG, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { ChatDisclaimer } from "@/components/fnoninja/chat/ChatDisclaimer";
import { ChatLockedState } from "@/components/fnoninja/chat/ChatLockedState";
import { ChatTermsGate } from "@/components/fnoninja/chat/ChatTermsGate";
import { MessageComposer, type ChatParticipant } from "@/components/fnoninja/chat/MessageComposer";
import { MessageList } from "@/components/fnoninja/chat/MessageList";

export function ChatPanel() {
  const { open, setOpen, roomId } = useChatPanel();
  const { user } = useUser();
  const profile = useMemo(
    () => ({ name: user?.displayName, email: user?.email, photo: user?.photoURL }),
    [user?.displayName, user?.email, user?.photoURL],
  );
  // Drives subscription gating and ensures the chat_members mirror exists.
  const subscription = useSubscription(user?.uid, profile);
  const { member, loading: memberLoading } = useChatMember();

  const canChat = member?.canChat ?? subscription.isActive;
  const isBanned = member?.isBanned === true;
  const acceptedTerms = !!member?.acceptedTermsAt;
  const ready = canChat && !isBanned && acceptedTerms;

  const { messages, loading, error, hasMore, loadingOlder, loadOlder } = useChatMessages(
    roomId,
    open && ready,
  );
  const onlineCount = useChatPresence(roomId, open && ready);

  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);

  const room = CHAT_ROOMS.find((r) => r.id === roomId) ?? CHAT_ROOMS[0];

  const allMessages = useMemo(() => {
    if (optimistic.length === 0) return messages;
    return [...messages, ...optimistic].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, optimistic]);

  // Mention candidates: people who've posted in the room (excluding yourself).
  const participants = useMemo<ChatParticipant[]>(() => {
    const map = new Map<string, ChatParticipant>();
    for (const m of allMessages) {
      if (!m.authorId || m.authorId === user?.uid || map.has(m.authorId)) continue;
      map.set(m.authorId, {
        id: m.authorId,
        name: m.authorName || "Trader",
        photo: m.authorPhoto ?? null,
      });
    }
    return Array.from(map.values());
  }, [allMessages, user?.uid]);

  if (!open || !user) return null;

  const handleSend = async (text: string) => {
    if (!user) return;
    const tempId = `temp-${Date.now()}`;
    const temp: ChatMessage = {
      id: tempId,
      roomId,
      authorId: user.uid,
      authorName: user.displayName ?? "You",
      authorPhoto: user.photoURL ?? null,
      text,
      createdAt: Date.now(),
      editedAt: null,
      deleted: false,
      deletedBy: null,
      mentions: [],
      flagged: false,
    };
    setOptimistic((prev) => [...prev, temp]);
    try {
      await sendChatMessage(user, roomId, text);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Message not sent",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setOptimistic((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const handleEdit = async (id: string, text: string) => {
    if (!user) return;
    try {
      await editChatMessage(user, roomId, id, text);
    } catch (e) {
      toast({ variant: "destructive", title: "Edit failed", description: e instanceof Error ? e.message : "" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteChatMessage(user, roomId, id);
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e instanceof Error ? e.message : "" });
    }
  };

  const handleReport = async (message: ChatMessage) => {
    if (!user) return;
    const reason = window.prompt("Why are you reporting this message?") ?? "";
    if (reason === "") return;
    try {
      await reportChatMessage(user, roomId, message.id, reason);
      toast({ title: "Reported", description: "Thanks — a moderator will review it." });
    } catch (e) {
      toast({ variant: "destructive", title: "Report failed", description: e instanceof Error ? e.message : "" });
    }
  };

  const subLoading = subscription.isLoading && memberLoading;

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close chat"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[180] bg-black/60 md:hidden"
      />

      <aside
        className="fixed right-0 top-14 z-[185] flex w-full flex-col shadow-2xl sm:top-16 md:w-[380px]"
        style={{
          height: "calc(100% - 3.5rem)",
          backgroundColor: FNO_BG,
          borderLeft: `1px solid ${FNO_NAV_BORDER}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0" style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}` }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">#{room.name}</p>
            {ready ? (
              <p className="flex items-center gap-1 text-[10px]" style={{ color: "#64748b" }}>
                <Users className="h-2.5 w-2.5" /> {onlineCount} online
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {subLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : !canChat || isBanned ? (
          isBanned ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-rose-400">
              You are banned from the community chat.
            </div>
          ) : (
            <ChatLockedState />
          )
        ) : !acceptedTerms ? (
          <ChatTermsGate onAccepted={() => { /* member snapshot updates via onSnapshot */ }} />
        ) : (
          <>
            {error ? (
              <div className="px-3 py-2 text-[11px] text-rose-400">{error}</div>
            ) : null}
            <MessageList
              messages={allMessages}
              currentUid={user.uid}
              loading={loading}
              hasMore={hasMore}
              loadingOlder={loadingOlder}
              loadOlder={loadOlder}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReport={handleReport}
            />
            <ChatDisclaimer />
            <MessageComposer onSend={handleSend} participants={participants} />
          </>
        )}
      </aside>
    </>
  );
}
