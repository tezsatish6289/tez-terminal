"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Check, Flag, ImageIcon, Loader2, Pencil, Reply, RotateCw, Trash2, User, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/chat/types";
import { format } from "date-fns";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import {
  ATLAS_AUTHOR_PHOTO_LOCAL,
  isAtlasSystemAuthor,
} from "@/lib/chat/atlas-welcome";
import { CHAT_EDIT_WINDOW_MS, SUCCESS_STORIES_ROOM_ID } from "@/lib/chat/constants";
import {
  isSuccessStorySystemAuthor,
  parseSuccessStoryMessage,
} from "@/lib/chat/success-story-message";
import { ChatEmojiGrid } from "@/components/fnoninja/chat/ChatEmojiGrid";
import { SuccessStoryChatCard } from "@/components/fnoninja/chat/SuccessStoryChatCard";
import { isAllowedChatUrl } from "@/lib/chat/moderation";
import type { ChatMessage } from "@/lib/chat/types";

const INDEX_SYMBOLS = new Set([
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "NIFTYNXT50",
  "SENSEX",
  "BANKEX",
]);

const LONG_PRESS_MS = 450;

// Split on a $SYMBOL cashtag, an @handle mention, or a URL (http/https or www.),
// keeping the delimiters so we can style/linkify them and leave the rest as text.
const TOKEN_SPLIT =
  /(\$[A-Z][A-Z0-9&-]{1,19}\b|@[A-Za-z][A-Za-z0-9_]{0,29}|(?:https?:\/\/|www\.)[^\s]+)/g;

function symbolHref(symbol: string): string {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const scope = INDEX_SYMBOLS.has(symbol) ? "index" : "stock";
  return levelsChartPagePathForHost(hostname, scope, symbol);
}

function renderText(text: string) {
  const parts = text.split(TOKEN_SPLIT);
  return parts.map((part, i) => {
    if (!part) return <Fragment key={i} />;

    if (/^\$[A-Z]/.test(part)) {
      const symbol = part.slice(1).toUpperCase();
      return (
        <a
          key={i}
          href={symbolHref(symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold hover:underline"
          style={{ color: "#60a5fa" }}
        >
          {part}
        </a>
      );
    }

    if (/^@[A-Za-z]/.test(part)) {
      return (
        <span
          key={i}
          className="rounded px-0.5 font-semibold"
          style={{ color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.14)" }}
        >
          {part}
        </span>
      );
    }

    // Only FNONINJA links are clickable; anything else renders as plain text
    // (and is blocked at send time anyway).
    if (/^(?:https?:\/\/|www\.)/i.test(part) && isAllowedChatUrl(part)) {
      const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all hover:underline"
          style={{ color: "#60a5fa" }}
        >
          {part}
        </a>
      );
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface MessageItemProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUid: string;
  canReply: boolean;
  canReact: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (message: ChatMessage) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onJumpTo: (id: string) => void;
  highlight?: boolean;
}

function AttachmentGrid({
  attachments,
  onZoom,
  status,
}: {
  attachments: ChatAttachment[];
  onZoom: (a: ChatAttachment) => void;
  status?: "sending" | "failed";
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((a, i) => (
        <button
          key={a.path || a.url || i}
          type="button"
          onClick={() => (status ? undefined : onZoom(a))}
          className="relative block overflow-hidden rounded-lg transition-opacity hover:opacity-90"
          style={{ border: "1px solid rgba(90,140,220,0.2)" }}
          aria-label="View image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt=""
            width={a.width || undefined}
            height={a.height || undefined}
            loading="lazy"
            className="h-auto max-h-[260px] w-auto max-w-[220px] object-cover"
            style={{ opacity: status ? 0.6 : 1 }}
          />
          {status === "sending" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Lightbox({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Close image"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.url}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function MessageItem({
  message,
  isOwn,
  currentUid,
  canReply,
  canReact,
  onEdit,
  onDelete,
  onReport,
  onRetry,
  onDiscard,
  onReply,
  onReact,
  onJumpTo,
  highlight,
}: MessageItemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<ChatAttachment | null>(null);
  const [reactOpen, setReactOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const pending = message.clientStatus; // "sending" | "failed" | undefined
  const canEdit = isOwn && !pending && Date.now() - message.createdAt <= CHAT_EDIT_WINDOW_MS;
  const reactionEntries = Object.entries(message.reactions ?? {}).filter(([, uids]) => uids.length > 0);
  const isSuccessStoriesRoom = message.roomId === SUCCESS_STORIES_ROOM_ID;
  // Success Stories: I traded this is the only member action — no react / reply / flag.
  const showReactions = canReact && !pending && !isSuccessStoriesRoom;
  const showReply = canReply && !isSuccessStoriesRoom;
  const showReport = !isOwn && !isSuccessStoriesRoom;
  const showMessageActions =
    !editing && !pending && (showReactions || showReply || canEdit || isOwn || showReport);
  const menuOpen = menuPinned || reactOpen;
  const parsedStory =
    isSuccessStoriesRoom && !message.replyTo ? parseSuccessStoryMessage(message.text) : null;
  const successStory =
    parsedStory &&
    (isSuccessStorySystemAuthor(message.authorId) || Boolean(parsedStory.storyId))
      ? parsedStory
      : null;
  const isAtlas = isAtlasSystemAuthor(message.authorId);
  const avatarSrc =
    message.authorPhoto || (isAtlas ? ATLAS_AUTHOR_PHOTO_LOCAL : null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPinned(false);
    setReactOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rowRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  if (message.deleted) {
    return (
      <div data-mid={message.id} className="px-3 py-1.5 text-xs italic" style={{ color: "#475569" }}>
        Message removed{message.deletedBy === "mod" ? " by a moderator" : ""}.
      </div>
    );
  }

  const submitEdit = async () => {
    const next = draft.trim();
    if (!next || next === message.text) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onEdit(message.id, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    setBusy(true);
    try {
      await onDelete(message.id);
    } finally {
      setBusy(false);
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (!showMessageActions) return;
    const t = e.touches[0];
    if (!t) return;
    touchOrigin.current = { x: t.clientX, y: t.clientY };
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      setMenuPinned(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(12);
        } catch {
          /* ignore */
        }
      }
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (e: TouchEvent) => {
    const origin = touchOrigin.current;
    const t = e.touches[0];
    if (!origin || !t) return;
    if (Math.abs(t.clientX - origin.x) > 10 || Math.abs(t.clientY - origin.y) > 10) {
      clearLongPress();
    }
  };

  const onTouchEnd = () => {
    clearLongPress();
    touchOrigin.current = null;
  };

  return (
    <div
      ref={rowRef}
      data-mid={message.id}
      className="group relative flex gap-2.5 px-3 py-2 transition-colors duration-700 hover:bg-white/[0.02]"
      style={highlight ? { backgroundColor: "rgba(37,99,235,0.16)" } : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onContextMenu={(e) => {
        if (showMessageActions) e.preventDefault();
      }}
    >
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(37,99,235,0.12)" }}>
        {avatarSrc ? (
          <Image src={avatarSrc} alt="" width={28} height={28} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-3.5 w-3.5" style={{ color: "#60a5fa" }} />
          </div>
        )}
      </div>

      <div
        className={[
          "relative min-w-0 flex-1",
          // Reserve space under the message while the action pill is visible so hover
          // doesn't die in the gap and the next row isn't covered.
          showMessageActions
            ? "[@media(hover:hover)]:group-hover:pb-11 data-[menu-open=true]:pb-11"
            : "",
        ].join(" ")}
        data-menu-open={menuOpen ? "true" : "false"}
      >
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-white">{message.authorName}</span>
          {isAtlas ? (
            <span
              className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide"
              style={{ color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.2)" }}
            >
              AI
            </span>
          ) : null}
          <span className="text-[10px]" style={{ color: "#475569" }}>
            {format(new Date(message.createdAt), "HH:mm")}
            {message.editedAt ? " · edited" : ""}
          </span>
          {message.flagged ? (
            <span className="text-[10px]" style={{ color: "#fbbf24" }} title="Flagged for review">
              ⚑
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-1 flex items-start gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-md px-2 py-1 text-xs text-slate-100 outline-none"
              style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.2)" }}
            />
            <button type="button" onClick={submitEdit} disabled={busy} className="rounded p-1 text-emerald-400 hover:bg-white/5" aria-label="Save edit">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => { setEditing(false); setDraft(message.text); }} className="rounded p-1 text-slate-500 hover:bg-white/5" aria-label="Cancel edit">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            {message.replyTo ? (
              <button
                type="button"
                onClick={() => onJumpTo(message.replyTo!.id)}
                className="mb-1 mt-0.5 block w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-white/5"
                style={{ backgroundColor: "rgba(37,99,235,0.08)", borderLeft: "2px solid #3b82f6" }}
                title="View replied message"
              >
                <span className="block truncate text-[10px] font-semibold" style={{ color: "#93c5fd" }}>
                  {message.replyTo.authorName}
                </span>
                <span className="flex items-center gap-1 truncate text-[11px]" style={{ color: "#7d8da3" }}>
                  {message.replyTo.hasImage ? (
                    <>
                      <ImageIcon className="h-2.5 w-2.5 shrink-0" />
                      {message.replyTo.text || "Photo"}
                    </>
                  ) : (
                    message.replyTo.text
                  )}
                </span>
              </button>
            ) : null}
            {successStory ? (
              <SuccessStoryChatCard
                parsed={successStory}
                onWatch={() => {
                  if (successStory.storyId) {
                    router.push(`${pathname}?story=${encodeURIComponent(successStory.storyId)}`);
                  } else if (successStory.storyUrl) {
                    window.open(successStory.storyUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              />
            ) : message.text ? (
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
                {renderText(message.text)}
              </p>
            ) : null}
            {message.attachments?.length ? (
              <AttachmentGrid attachments={message.attachments} onZoom={setZoom} status={pending} />
            ) : null}
            {pending === "sending" ? (
              <p className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: "#64748b" }}>
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending…
              </p>
            ) : null}
            {pending === "failed" ? (
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="text-rose-400">Failed to send.</span>
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  className="flex items-center gap-1 font-semibold text-blue-400 hover:text-blue-300"
                >
                  <RotateCw className="h-2.5 w-2.5" /> Retry
                </button>
                <button
                  type="button"
                  onClick={() => onDiscard(message.id)}
                  className="font-semibold text-slate-500 hover:text-slate-300"
                >
                  Discard
                </button>
              </div>
            ) : null}
            {showReactions && reactionEntries.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {reactionEntries.map(([emoji, uids]) => {
                  const mine = uids.includes(currentUid);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onReact(message.id, emoji)}
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] transition-colors hover:bg-white/10"
                      style={{
                        backgroundColor: mine ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.06)",
                        border: mine ? "1px solid rgba(96,165,250,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      }}
                      aria-label={`${emoji} ${uids.length} reaction${uids.length === 1 ? "" : "s"}`}
                    >
                      <span>{emoji}</span>
                      <span className="text-[10px] font-semibold" style={{ color: "#94a3b8" }}>
                        {uids.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {showMessageActions ? (
              <div
                data-open={menuOpen ? "true" : "false"}
                className={[
                  "absolute bottom-1 left-0 z-30 inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 shadow-lg transition-opacity duration-150",
                  "opacity-0 pointer-events-none",
                  "data-[open=true]:pointer-events-auto data-[open=true]:opacity-100",
                  "[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100",
                ].join(" ")}
                style={{
                  backgroundColor: "#0f1c30",
                  border: "1px solid rgba(90,140,220,0.28)",
                }}
                role="toolbar"
                aria-label="Message actions"
              >
                {showReactions ? (
                  <button
                    type="button"
                    onClick={() => setReactOpen((o) => !o)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                    aria-label="Add reaction"
                    aria-pressed={reactOpen}
                  >
                    <span className="text-xs leading-none">😊</span>
                  </button>
                ) : null}
                {showReply ? (
                  <button
                    type="button"
                    onClick={() => {
                      onReply(message);
                      closeMenu();
                    }}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                    aria-label="Reply"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      closeMenu();
                    }}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                    aria-label="Edit message"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {isOwn ? (
                  <button
                    type="button"
                    onClick={() => void submitDelete()}
                    disabled={busy}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-rose-400"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : showReport ? (
                  <button
                    type="button"
                    onClick={() => {
                      onReport(message);
                      closeMenu();
                    }}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-amber-400"
                    aria-label="Report message"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                ) : null}

                {reactOpen && showReactions ? (
                  <ChatEmojiGrid
                    className="absolute bottom-full left-0 z-40 mb-1.5 w-[17.5rem] max-w-[calc(100vw-2rem)]"
                    cols={8}
                    onPick={(emoji) => {
                      onReact(message.id, emoji);
                      closeMenu();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {zoom ? <Lightbox attachment={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}
