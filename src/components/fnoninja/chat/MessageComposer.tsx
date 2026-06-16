"use client";

import { useState, type KeyboardEvent } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex items-end gap-2 px-3 py-2.5" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_MESSAGE_LENGTH))}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Share an observation… (use $NIFTY to tag a symbol)"
        disabled={disabled || sending}
        className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 disabled:opacity-60"
        style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.18)" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || sending || disabled}
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
        aria-label="Send message"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
      </button>
    </div>
  );
}
