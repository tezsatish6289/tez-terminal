/**
 * Pre-send content moderation for community chat.
 *
 * FNONINJA is informational only — users must not post buy/sell calls. We
 * cannot fully prevent it, but we flag messages that combine a ticker/cashtag
 * with directional trade language so a moderator can review them, and we hard
 * block a few unambiguous abuse patterns.
 */

import type { ChatMention } from "@/lib/chat/types";

const SYMBOL_REGEX = /\$([A-Z][A-Z0-9&-]{1,19})\b/g;

/** Directional trade language that, combined with a ticker, suggests a call. */
const TRADE_KEYWORDS = [
  "buy",
  "sell",
  "target",
  "tgt",
  "stoploss",
  "stop loss",
  "sl ",
  "long",
  "short",
  "entry",
  "exit",
  "call",
  "put",
  "ce ",
  "pe ",
];

const TICKER_HINT_REGEX =
  /(\$[A-Z]|nifty|banknifty|finnifty|sensex|\b\d{4,6}\s?(ce|pe)\b)/i;

export interface ModerationResult {
  /** True if the message must be rejected outright. */
  blocked: boolean;
  /** True if the message should be stored but flagged for review. */
  flagged: boolean;
  reason: string | null;
}

/** Extract unique `$SYMBOL` cashtags from message text. */
export function parseSymbolMentions(text: string): ChatMention[] {
  const seen = new Set<string>();
  const mentions: ChatMention[] = [];
  for (const match of text.matchAll(SYMBOL_REGEX)) {
    const symbol = match[1].toUpperCase();
    if (!seen.has(symbol)) {
      seen.add(symbol);
      mentions.push({ type: "symbol", symbol });
    }
  }
  return mentions;
}

export function moderateMessage(text: string): ModerationResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { blocked: true, flagged: false, reason: "Message is empty." };
  }

  // Block messages that are only links (common spam/phishing vector).
  const withoutUrls = trimmed.replace(/https?:\/\/\S+/gi, "").trim();
  if (trimmed.length > 0 && withoutUrls.length === 0) {
    return {
      blocked: true,
      flagged: false,
      reason: "Messages cannot be only links.",
    };
  }

  const lower = trimmed.toLowerCase();
  const hasTicker = TICKER_HINT_REGEX.test(trimmed);
  const hasTradeWord = TRADE_KEYWORDS.some((kw) => lower.includes(kw));

  if (hasTicker && hasTradeWord) {
    return {
      blocked: false,
      flagged: true,
      reason: "Possible trade call (ticker + directional language).",
    };
  }

  return { blocked: false, flagged: false, reason: null };
}
