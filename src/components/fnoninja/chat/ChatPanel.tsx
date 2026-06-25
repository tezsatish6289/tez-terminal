"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { ImagePlus, Loader2, Users, X } from "lucide-react";
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
  uploadChatImage,
} from "@/lib/chat/client";
import { CHAT_REPLY_SNIPPET_LENGTH, canUserPostInRoom, getChatRoom } from "@/lib/chat/constants";
import { isAdminEmail } from "@/lib/admin-emails-client";
import type { ChatAttachment, ChatMessage, ChatReplyRef } from "@/lib/chat/types";
import { FNO_BG, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { ChatRoomSidebar } from "@/components/fnoninja/chat/ChatRoomSidebar";
import { ChatDisclaimer } from "@/components/fnoninja/chat/ChatDisclaimer";
import { ChatLockedState } from "@/components/fnoninja/chat/ChatLockedState";
import { ChatTermsGate } from "@/components/fnoninja/chat/ChatTermsGate";
import { MessageComposer, type ChatParticipant } from "@/components/fnoninja/chat/MessageComposer";
import { MessageList } from "@/components/fnoninja/chat/MessageList";

export function ChatPanel() {
  const { open, setOpen, roomId, setRoomId, unreadByRoom } = useChatPanel();
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

  // Outgoing messages uploading/sending in the background (WhatsApp-style):
  // shown optimistically with a sending/failed state until the real message
  // arrives via RTDB. Their attachment URLs are local blob previews.
  const [outgoing, setOutgoing] = useState<ChatMessage[]>([]);
  // Per outgoing message: original files + reply target, kept for retry.
  const outgoingMetaRef = useRef<Map<string, { files: File[]; replyToId?: string }>>(new Map());
  // The message the user is currently replying to (null when not replying).
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  // Lets the panel-wide drop zone push files into the composer.
  const addFilesRef = useRef<(files: File[]) => void>(() => {});
  const registerAddFiles = useCallback((fn: (files: File[]) => void) => {
    addFilesRef.current = fn;
  }, []);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const room = getChatRoom(roomId);
  const canPost = canUserPostInRoom(roomId, user?.email);
  const isAdmin = isAdminEmail(user?.email);

  const allMessages = useMemo(() => {
    if (outgoing.length === 0) return messages;
    return [...messages, ...outgoing].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, outgoing]);

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

  const revokePreviews = (m: ChatMessage | undefined) => {
    m?.attachments?.forEach((a) => {
      if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
    });
  };

  // Upload any images, then post the message. On failure the optimistic copy is
  // flagged "failed" so the user can retry; on success it's dropped (the real
  // message streams in via RTDB).
  const runSend = async (tempId: string, text: string) => {
    const meta = outgoingMetaRef.current.get(tempId) ?? { files: [] };
    try {
      const attachments: ChatAttachment[] = [];
      for (const file of meta.files) {
        attachments.push(await uploadChatImage(user, roomId, file));
      }
      await sendChatMessage(user, roomId, text, attachments.map((a) => a.path), meta.replyToId);
      setOutgoing((prev) => {
        revokePreviews(prev.find((m) => m.id === tempId));
        return prev.filter((m) => m.id !== tempId);
      });
      outgoingMetaRef.current.delete(tempId);
    } catch {
      setOutgoing((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, clientStatus: "failed" } : m)),
      );
    }
  };

  const handleSend = (text: string, files: File[]) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previews: ChatAttachment[] = files.map((f) => ({
      path: "",
      url: URL.createObjectURL(f),
      mimeType: f.type,
      width: 0,
      height: 0,
      sizeBytes: f.size,
    }));
    const reply = replyTarget;
    const replyTo: ChatReplyRef | undefined = reply
      ? {
          id: reply.id,
          authorName: reply.authorName,
          text: reply.text.slice(0, CHAT_REPLY_SNIPPET_LENGTH),
          hasImage: !!reply.attachments?.length,
        }
      : undefined;
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
      attachments: previews.length ? previews : undefined,
      replyTo,
      clientStatus: "sending",
    };
    outgoingMetaRef.current.set(tempId, { files, replyToId: reply?.id });
    setOutgoing((prev) => [...prev, temp]);
    setReplyTarget(null);
    void runSend(tempId, text);
  };

  const handleRetry = (id: string) => {
    const msg = outgoing.find((m) => m.id === id);
    if (!msg) return;
    setOutgoing((prev) => prev.map((m) => (m.id === id ? { ...m, clientStatus: "sending" } : m)));
    void runSend(id, msg.text);
  };

  const handleDiscard = (id: string) => {
    setOutgoing((prev) => {
      revokePreviews(prev.find((m) => m.id === id));
      return prev.filter((m) => m.id !== id);
    });
    outgoingMetaRef.current.delete(id);
  };

  const handleReply = (message: ChatMessage) => {
    setReplyTarget(message);
  };

  const hasDraggedFiles = (e: ReactDragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onPanelDragEnter = (e: ReactDragEvent) => {
    if (!ready || !canPost || !hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onPanelDragOver = (e: ReactDragEvent) => {
    if (!ready || !canPost || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onPanelDragLeave = (e: ReactDragEvent) => {
    if (!hasDraggedFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onPanelDrop = (e: ReactDragEvent) => {
    if (!ready || !canPost) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) addFilesRef.current(files);
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

  // Wait for BOTH the subscription status and the member doc before deciding
  // which gate to show — otherwise we briefly flash "Load plans" then "Accept
  // terms" on refresh as each source resolves independently.
  const subLoading = subscription.isLoading || memberLoading;

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
        className="fixed right-0 top-14 z-[185] flex w-full flex-col shadow-2xl sm:top-16 md:w-[480px]"
        style={{
          height: "calc(100% - 3.5rem)",
          backgroundColor: FNO_BG,
          borderLeft: `1px solid ${FNO_NAV_BORDER}`,
        }}
        onDragEnter={onPanelDragEnter}
        onDragOver={onPanelDragOver}
        onDragLeave={onPanelDragLeave}
        onDrop={onPanelDrop}
      >
        {dragOver && ready && canPost ? (
          <div
            className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl text-center"
            style={{
              backgroundColor: "rgba(10,22,40,0.94)",
              border: "2px dashed rgba(96,165,250,0.7)",
            }}
          >
            <ImagePlus className="h-7 w-7" style={{ color: "#93c5fd" }} />
            <span className="text-sm font-semibold text-slate-100">Drop image to share</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>
              Add a caption, then send
            </span>
          </div>
        ) : null}

        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0" style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}` }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{room?.name ?? "Community chat"}</p>
            {ready ? (
              <p className="truncate text-[10px]" style={{ color: "#64748b" }}>
                {room?.adminOnlyPost && !isAdmin ? (
                  "Read-only · team announcements"
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" /> {onlineCount} online
                  </span>
                )}
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
          <div className="flex min-h-0 flex-1">
            <ChatRoomSidebar
              roomId={roomId}
              onSelectRoom={setRoomId}
              unreadByRoom={unreadByRoom}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              {room?.description ? (
                <p
                  className="shrink-0 px-3 py-2 text-[10px] leading-snug"
                  style={{ color: "#64748b", borderBottom: `1px solid ${FNO_NAV_BORDER}` }}
                >
                  {room.description}
                </p>
              ) : null}
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
                onRetry={handleRetry}
                onDiscard={handleDiscard}
                onReply={handleReply}
              />
              {canPost ? (
                <>
                  <ChatDisclaimer />
                  <MessageComposer
                    onSend={handleSend}
                    onRegisterAddFiles={registerAddFiles}
                    participants={participants}
                    placeholder={room?.composerPlaceholder}
                    replyingTo={
                      replyTarget
                        ? {
                            authorName: replyTarget.authorName,
                            text: replyTarget.text,
                            hasImage: !!replyTarget.attachments?.length,
                          }
                        : null
                    }
                    onCancelReply={() => setReplyTarget(null)}
                  />
                </>
              ) : (
                <div
                  className="shrink-0 px-4 py-3 text-center text-[11px] leading-snug"
                  style={{
                    color: "#64748b",
                    borderTop: `1px solid ${FNO_NAV_BORDER}`,
                    paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
                  }}
                >
                  Product updates from the FNONINJA team. Only admins can post here.
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
