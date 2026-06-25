"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import {
  Hash,
  ImageIcon,
  Loader2,
  Plus,
  Reply,
  SendHorizontal,
  Smile,
  User,
  X,
} from "lucide-react";
import {
  CHAT_IMAGE_ACCEPT,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_MESSAGE_LENGTH,
} from "@/lib/chat/constants";
import { toMentionHandle } from "@/lib/chat/moderation";
import {
  LEVELS_SYMBOL_CATALOG,
  filterLevelsSymbolCatalog,
} from "@/lib/levels/levels-symbol-catalog";

export interface ChatParticipant {
  id: string;
  name: string;
  photo: string | null;
}

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ReplyingTo {
  authorName: string;
  text: string;
  hasImage: boolean;
}

interface MessageComposerProps {
  /** Hands the draft off to the panel, which uploads + sends in the background. */
  onSend: (text: string, files: File[]) => void;
  participants?: ChatParticipant[];
  disabled?: boolean;
  /**
   * Lets the parent (panel) push files in from a panel-wide drop zone. The
   * composer registers its file-add handler here on mount.
   */
  onRegisterAddFiles?: (add: (files: File[]) => void) => void;
  /** The message being replied to, or null. Shown as a bar above the input. */
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  placeholder?: string;
}

let selectedIdSeq = 0;

type Trigger = "$" | "@";

const EMOJIS = [
  "📈", "📉", "💹", "🚀", "🔥", "👀", "🎯", "💰",
  "🤝", "👍", "👎", "🙏", "💪", "🧠", "⚡", "✅",
  "❌", "⚠️", "🟢", "🔴", "😂", "😅", "😎", "🤔",
  "😱", "🥳", "😴", "🫡", "💯", "🙌", "👏", "❤️",
];

interface Suggestion {
  /** Token inserted into the text, including the trigger (e.g. "$NIFTY", "@Satish"). */
  insert: string;
  primary: string;
  secondary?: string;
  photo?: string | null;
  trigger: Trigger;
}

/** Detect a `$`/`@` mention token ending at the caret (must follow start/space). */
function detectTrigger(
  value: string,
  caret: number,
): { trigger: Trigger; query: string; start: number } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(?:^|\s)([@$])([A-Za-z0-9_&-]*)$/);
  if (!m) return null;
  const trigger = m[1] as Trigger;
  const query = m[2] ?? "";
  return { trigger, query, start: caret - query.length - 1 };
}

export function MessageComposer({
  onSend,
  participants = [],
  disabled,
  onRegisterAddFiles,
  replyingTo,
  onCancelReply,
  placeholder = "Share an observation…",
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [trigger, setTrigger] = useState<{ trigger: Trigger; query: string; start: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<SelectedImage[]>([]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef(0);

  // Revoke any outstanding object URLs on unmount.
  useEffect(() => {
    return () => {
      setSelected((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return prev;
      });
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const images = files.filter((f) => CHAT_IMAGE_ACCEPT.includes(f.type as never));
    if (images.length === 0) return;
    setSelected((prev) => {
      const room = CHAT_MAX_ATTACHMENTS - prev.length;
      const toAdd = images.slice(0, Math.max(0, room)).map<SelectedImage>((file) => ({
        id: `img-${selectedIdSeq++}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  // Register the file-add handler so the panel's drop zone can feed files in.
  useEffect(() => {
    onRegisterAddFiles?.(addFiles);
  }, [onRegisterAddFiles, addFiles]);

  // Focus the input when the user starts a reply.
  useEffect(() => {
    if (replyingTo) taRef.current?.focus();
  }, [replyingTo]);

  const removeSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const onFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFiles(files);
    e.target.value = "";
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const insertAtCaret = useCallback(
    (snippet: string) => {
      const el = taRef.current;
      const caret = el?.selectionStart ?? text.length;
      const next = `${text.slice(0, caret)}${snippet}${text.slice(caret)}`.slice(
        0,
        CHAT_MAX_MESSAGE_LENGTH,
      );
      const nextCaret = Math.min(caret + snippet.length, next.length);
      setText(next);
      requestAnimationFrame(() => {
        const e2 = taRef.current;
        if (e2) {
          e2.focus();
          e2.setSelectionRange(nextCaret, nextCaret);
          caretRef.current = nextCaret;
        }
      });
    },
    [text],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    if (trigger.trigger === "$") {
      const entries = trigger.query
        ? filterLevelsSymbolCatalog(trigger.query, 8)
        : LEVELS_SYMBOL_CATALOG.slice(0, 6);
      return entries.map((e) => ({
        insert: `$${e.symbol}`,
        primary: e.symbol,
        secondary: e.scope === "index" ? `${e.label} · Index` : e.label,
        trigger: "$" as const,
      }));
    }
    const q = trigger.query.toLowerCase();
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const p of participants) {
      const handle = toMentionHandle(p.name);
      if (!handle) continue;
      const key = handle.toLowerCase();
      if (seen.has(key)) continue;
      if (q && !p.name.toLowerCase().includes(q) && !key.includes(q)) continue;
      seen.add(key);
      out.push({
        insert: `@${handle}`,
        primary: p.name,
        secondary: `@${handle}`,
        photo: p.photo,
        trigger: "@" as const,
      });
      if (out.length >= 8) break;
    }
    return out;
  }, [trigger, participants]);

  const refresh = useCallback((value: string, caret: number) => {
    caretRef.current = caret;
    const next = detectTrigger(value, caret);
    setTrigger(next);
    setSuggestOpen(next !== null);
    setActiveIndex(0);
    if (next) setEmojiOpen(false);
  }, []);

  const closeSuggestions = useCallback(() => {
    setSuggestOpen(false);
    setTrigger(null);
  }, []);

  const applySuggestion = useCallback(
    (s: Suggestion) => {
      if (!trigger) return;
      const caret = caretRef.current;
      const before = text.slice(0, trigger.start);
      const after = text.slice(caret);
      const insertText = `${s.insert} `;
      const next = `${before}${insertText}${after}`.slice(0, CHAT_MAX_MESSAGE_LENGTH);
      const nextCaret = Math.min(before.length + insertText.length, next.length);
      setText(next);
      closeSuggestions();
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
          caretRef.current = nextCaret;
        }
      });
    },
    [text, trigger, closeSuggestions],
  );

  const canSubmit = (text.trim().length > 0 || selected.length > 0) && !sending && !disabled;

  const submit = () => {
    if (!canSubmit) return;
    const trimmed = text.trim();
    const files = selected.map((s) => s.file);
    // Hand off to the panel; it queues an optimistic message and uploads in the
    // background. Reset the composer immediately (WhatsApp-style).
    onSend(trimmed, files);
    setText("");
    setSelected((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    closeSuggestions();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[activeIndex] ?? suggestions[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSuggestions();
        return;
      }
    }

    if (e.key === "Escape" && emojiOpen) {
      e.preventDefault();
      setEmojiOpen(false);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative">
      {suggestOpen && suggestions.length > 0 ? (
        <ul
          className="absolute bottom-full left-3 right-3 mb-2 max-h-52 overflow-y-auto rounded-xl py-1 shadow-2xl"
          style={{
            backgroundColor: "rgba(12,18,30,0.99)",
            border: "1px solid rgba(90,140,220,0.22)",
          }}
          role="listbox"
        >
          {suggestions.map((s, i) => {
            const active = i === activeIndex;
            return (
              <li key={s.insert} role="option" aria-selected={active}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  style={{ backgroundColor: active ? "rgba(37,99,235,0.18)" : "transparent" }}
                  onMouseDown={(e) => {
                    // Act on mousedown (before the textarea blur) so the pick
                    // always registers, then keep focus in the input.
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {s.trigger === "@" ? (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full"
                      style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
                    >
                      {s.photo ? (
                        <Image
                          src={s.photo}
                          alt=""
                          width={24}
                          height={24}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <User className="h-3 w-3" style={{ color: "#60a5fa" }} />
                      )}
                    </span>
                  ) : (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
                    >
                      <Hash className="h-3 w-3" style={{ color: "#60a5fa" }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white">
                      {s.primary}
                    </span>
                    {s.secondary ? (
                      <span className="block truncate text-[10px]" style={{ color: "#64748b" }}>
                        {s.secondary}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {emojiOpen ? (
        <div
          className="absolute bottom-full left-3 right-3 mb-2 grid grid-cols-8 gap-1 rounded-xl p-2 shadow-2xl"
          style={{
            backgroundColor: "rgba(12,18,30,0.99)",
            border: "1px solid rgba(90,140,220,0.22)",
          }}
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-white/10"
              onMouseDown={(e) => {
                e.preventDefault();
                insertAtCaret(emoji);
              }}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="px-3 pt-1.5"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        {replyingTo ? (
          <div
            className="mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
            style={{ backgroundColor: "rgba(37,99,235,0.08)", borderLeft: "2px solid #3b82f6" }}
          >
            <Reply className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold" style={{ color: "#93c5fd" }}>
                Replying to {replyingTo.authorName}
              </p>
              <p className="flex items-center gap-1 truncate text-[11px]" style={{ color: "#94a3b8" }}>
                {replyingTo.hasImage ? (
                  <>
                    <ImageIcon className="h-3 w-3 shrink-0" />
                    {replyingTo.text || "Photo"}
                  </>
                ) : (
                  replyingTo.text
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-2">
            {selected.map((p) => (
              <div
                key={p.id}
                className="relative h-16 w-16 overflow-hidden rounded-lg"
                style={{ border: "1px solid rgba(90,140,220,0.2)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeSelected(p.id)}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                  aria-label="Remove image"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={CHAT_IMAGE_ACCEPT.join(",")}
          multiple
          className="hidden"
          onChange={onFilePick}
        />

        <div
          className="flex items-end gap-0.5 rounded-[20px] py-1 pl-1 pr-1.5 transition-colors focus-within:border-[rgba(90,140,220,0.4)]"
          style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.18)" }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || sending || selected.length >= CHAT_MAX_ATTACHMENTS}
            className="flex h-9 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
            style={{ color: "#64748b" }}
            aria-label="Attach image"
            title={`Attach screenshot (up to ${CHAT_MAX_ATTACHMENTS})`}
          >
            <Plus className="h-[20px] w-[20px]" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              closeSuggestions();
              setEmojiOpen((v) => !v);
            }}
            disabled={disabled || sending}
            className="flex h-9 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
            style={{ color: emojiOpen ? "#93c5fd" : "#64748b" }}
            aria-label="Insert emoji"
            aria-pressed={emojiOpen}
          >
            <Smile className="h-[18px] w-[18px]" />
          </button>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              const value = e.target.value.slice(0, CHAT_MAX_MESSAGE_LENGTH);
              setText(value);
              refresh(value, e.target.selectionStart ?? value.length);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onClick={(e) => refresh(text, e.currentTarget.selectionStart ?? text.length)}
            onBlur={() => window.setTimeout(closeSuggestions, 120)}
            rows={1}
            placeholder={placeholder}
            disabled={disabled || sending}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all hover:scale-105 disabled:scale-100 disabled:opacity-30"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
