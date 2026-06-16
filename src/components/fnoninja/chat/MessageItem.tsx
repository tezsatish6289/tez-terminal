"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { Check, Flag, Loader2, Pencil, Trash2, User, X } from "lucide-react";
import { format } from "date-fns";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { CHAT_EDIT_WINDOW_MS } from "@/lib/chat/constants";
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

const SYMBOL_SPLIT = /(\$[A-Z][A-Z0-9&-]{1,19})\b/g;

function symbolHref(symbol: string): string {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const scope = INDEX_SYMBOLS.has(symbol) ? "index" : "stock";
  return levelsChartPagePathForHost(hostname, scope, symbol);
}

function renderText(text: string) {
  const parts = text.split(SYMBOL_SPLIT);
  return parts.map((part, i) => {
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
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface MessageItemProps {
  message: ChatMessage;
  isOwn: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReport: (message: ChatMessage) => void;
}

export function MessageItem({ message, isOwn, onEdit, onDelete, onReport }: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);

  const canEdit = isOwn && Date.now() - message.createdAt <= CHAT_EDIT_WINDOW_MS;

  if (message.deleted) {
    return (
      <div className="px-3 py-1.5 text-xs italic" style={{ color: "#475569" }}>
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
    <div className="group flex gap-2.5 px-3 py-2 hover:bg-white/[0.02]">
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
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
            {renderText(message.text)}
          </p>
        )}
      </div>

      {!editing ? (
        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
