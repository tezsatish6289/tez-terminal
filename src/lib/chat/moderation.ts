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

/** `@handle` user mention — letters/digits/underscore, no spaces. */
export const USER_MENTION_REGEX = /@([A-Za-z][A-Za-z0-9_]{0,29})/g;

/**
 * Turn a display name into a space-free mention handle (its first name token).
 * "Satish Sharma" → "Satish", "ravi.kumar" → "ravi". Used by the composer when
 * inserting an @mention so it parses/renders cleanly everywhere.
 */
export function toMentionHandle(name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^A-Za-z0-9_]/g, "");
  return cleaned.slice(0, 30);
}

/**
 * Matches http(s) URLs and scheme-less `www.` links so we can vet every link a
 * user posts. Shared by the renderer so what we permit is exactly what we
 * linkify.
 */
export const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/gi;

/**
 * First-party hosts whose links are allowed in chat. Only FNONINJA links may be
 * shared (e.g. https://fnoninja.com/levels/chart?...); everything else is
 * blocked to prevent spam/phishing and off-platform promotion. `localhost` is
 * permitted so deep-links work during local testing.
 */
const ALLOWED_LINK_HOSTS = new Set(["fnoninja.com", "www.fnoninja.com", "localhost"]);

function hostFromUrl(raw: string): string | null {
  try {
    const cleaned = raw.replace(/[.,)\]}>'"]+$/, "");
    const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True if a posted link points at an allowed FNONINJA host (or a subdomain). */
export function isAllowedChatUrl(raw: string): boolean {
  const host = hostFromUrl(raw);
  if (!host) return false;
  return ALLOWED_LINK_HOSTS.has(host) || host.endsWith(".fnoninja.com");
}

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

/** Extract unique `@handle` user mentions from message text. */
export function parseUserMentions(text: string): ChatMention[] {
  const seen = new Set<string>();
  const mentions: ChatMention[] = [];
  for (const match of text.matchAll(USER_MENTION_REGEX)) {
    const handle = match[1];
    const key = handle.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      mentions.push({ type: "user", handle });
    }
  }
  return mentions;
}

/** Extract all mentions (symbols + users) from message text. */
export function parseMentions(text: string): ChatMention[] {
  return [...parseSymbolMentions(text), ...parseUserMentions(text)];
}

export function moderateMessage(text: string): ModerationResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { blocked: true, flagged: false, reason: "Message is empty." };
  }

  // Only FNONINJA links may be shared. Block any link pointing elsewhere.
  const urls = trimmed.match(URL_REGEX) ?? [];
  if (urls.some((u) => !isAllowedChatUrl(u))) {
    return {
      blocked: true,
      flagged: false,
      reason: "Only fnoninja.com links can be shared in chat.",
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
