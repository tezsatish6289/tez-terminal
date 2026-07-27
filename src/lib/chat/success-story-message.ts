/**
 * Parse Success Stories chat posts into a card-friendly shape.
 * Supports the new hype copy and the older `$SYM +X% …\nurl` format.
 */

export interface ParsedSuccessStoryMessage {
  symbol: string;
  movePct: string | null;
  storyId: string | null;
  storyUrl: string | null;
  sideHint: "support" | "resistance" | null;
}

const STORY_URL_RE =
  /https?:\/\/(?:www\.)?fnoninja\.com\/levels\?story=([A-Za-z0-9_-]+)/i;

export function parseSuccessStoryMessage(text: string): ParsedSuccessStoryMessage | null {
  const storyMatch = text.match(STORY_URL_RE);
  const storyId = storyMatch?.[1] ?? null;
  const storyUrl = storyMatch?.[0] ?? null;

  const symMatch = text.match(/\$([A-Z][A-Z0-9&-]{1,19})\b/);
  const moveMatch = text.match(/\+(\d+(?:\.\d+)?)%/);

  if (!symMatch && !storyId) return null;

  let sideHint: "support" | "resistance" | null = null;
  if (/put-wall|support held/i.test(text)) sideHint = "support";
  else if (/call-wall|resistance held/i.test(text)) sideHint = "resistance";

  return {
    symbol: (symMatch?.[1] ?? "WIN").toUpperCase(),
    movePct: moveMatch?.[1] ?? null,
    storyId,
    storyUrl,
    sideHint,
  };
}

export function buildSuccessStoryChatText(input: {
  symbol: string;
  label: string;
  movePct: number;
  side: "support" | "resistance";
  storyUrl: string;
}): string {
  const moveStr = input.movePct.toFixed(1);
  const setup =
    input.side === "support"
      ? "Put-wall bounce that held"
      : "Call-wall rejection that held";

  return [
    `$${input.symbol} +${moveStr}% to max pain`,
    `${setup} · ${input.label}`,
    input.storyUrl,
  ].join("\n");
}

export function isSuccessStorySystemAuthor(authorId: string): boolean {
  return authorId === "system:success-stories";
}
