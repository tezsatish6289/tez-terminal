"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { Hash, Loader2, SendHorizontal, User } from "lucide-react";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
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

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  participants?: ChatParticipant[];
  disabled?: boolean;
}

type Trigger = "$" | "@";

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

export function MessageComposer({ onSend, participants = [], disabled }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [trigger, setTrigger] = useState<{ trigger: Trigger; query: string; start: number } | null>(
    null,
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(0);

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

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
      closeSuggestions();
    } finally {
      setSending(false);
    }
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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
      {suggestOpen && suggestions.length > 0 ? (
        <ul
          className="absolute bottom-full left-3 right-3 mb-1 max-h-52 overflow-y-auto rounded-xl py-1 shadow-2xl"
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
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => applySuggestion(s)}
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

      <div className="flex items-end gap-2 px-3 py-2.5">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            const value = e.target.value.slice(0, CHAT_MAX_MESSAGE_LENGTH);
            setText(value);
            refresh(value, e.target.selectionStart ?? value.length);
          }}
          onKeyDown={onKeyDown}
          onClick={(e) => refresh(text, e.currentTarget.selectionStart ?? text.length)}
          onBlur={() => window.setTimeout(closeSuggestions, 120)}
          rows={1}
          placeholder="Share an observation… ($NIFTY to tag a symbol, @ to mention)"
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
    </div>
  );
}
