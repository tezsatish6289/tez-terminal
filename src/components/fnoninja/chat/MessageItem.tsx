"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Flag, ImageIcon, Loader2, Pencil, Reply, RotateCw, Trash2, User, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/chat/types";
import { format } from "date-fns";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { CHAT_EDIT_WINDOW_MS } from "@/lib/chat/constants";
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
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (message: ChatMessage) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onReply: (message: ChatMessage) => void;
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
  onEdit,
  onDelete,
  onReport,
  onRetry,
  onDiscard,
  onReply,
  onJumpTo,
  highlight,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<ChatAttachment | null>(null);

  const pending = message.clientStatus; // "sending" | "failed" | undefined
  const canEdit = isOwn && !pending && Date.now() - message.createdAt <= CHAT_EDIT_WINDOW_MS;

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

  return (
    <div
      data-mid={message.id}
      className="group flex gap-2.5 px-3 py-2 transition-colors duration-700 hover:bg-white/[0.02]"
      style={highlight ? { backgroundColor: "rgba(37,99,235,0.16)" } : undefined}
    >
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(37,99,235,0.12)" }}>
        {message.authorPhoto ? (
          <Image src={message.authorPhoto} alt="" width={28} height={28} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-3.5 w-3.5" style={{ color: "#60a5fa" }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-white">{message.authorName}</span>
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
            {message.text ? (
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
          </>
        )}
      </div>

      {zoom ? <Lightbox attachment={zoom} onClose={() => setZoom(null)} /> : null}

      {!editing && !pending ? (
        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onReply(message)} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300" aria-label="Reply">
            <Reply className="h-3 w-3" />
          </button>
          {canEdit ? (
            <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300" aria-label="Edit message">
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          {isOwn ? (
            <button type="button" onClick={submitDelete} disabled={busy} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-rose-400" aria-label="Delete message">
              <Trash2 className="h-3 w-3" />
            </button>
          ) : (
            <button type="button" onClick={() => onReport(message)} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-amber-400" aria-label="Report message">
              <Flag className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
