import type {
  BubblesBoardSnapshot,
  BubblesBoardToneKey,
} from "@/lib/fnoninja/bubbles-board";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { formatMmiValue, MMI_ZONE_META } from "@/lib/fnoninja/mmi";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";
import type { SocialPlatformId } from "@/lib/social/platforms";

export const BUBBLES_BOARD_PUBLIC_URL = `${FNONINJA_SITE_URL}/levels`;

function symbolsLine(
  board: BubblesBoardSnapshot,
  tone: BubblesBoardToneKey,
  max = 4,
): string | null {
  const count = board.counts[tone];
  if (count <= 0) return null;
  const label = BUBBLE_TONE_STYLE[tone].label;
  const names = board.samples[tone].slice(0, max).map((s) => s.symbol);
  const more = count > names.length ? ` (+${count - names.length} more)` : "";
  const list = names.length ? `: ${names.join(", ")}${more}` : "";
  return `${label} (${count})${list}`;
}

function mmiLine(board: BubblesBoardSnapshot): string | null {
  if (!board.mmi) return null;
  const zone = MMI_ZONE_META[board.mmi.zone].label;
  return `Market mood (MMI): ${formatMmiValue(board.mmi.value)} — ${zone}`;
}

function summaryLines(board: BubblesBoardSnapshot): string[] {
  const tones: BubblesBoardToneKey[] = ["IN_BULL", "NEAR_BULL", "IN_BEAR", "NEAR_BEAR"];
  return tones.map((t) => symbolsLine(board, t)).filter((l): l is string => Boolean(l));
}

/** Human captions for the morning bubbles map (image + /levels link). */
export function buildBubblesBoardCaptions(
  board: BubblesBoardSnapshot,
): Partial<Record<SocialPlatformId, string>> {
  const url = BUBBLES_BOARD_PUBLIC_URL;
  const mmi = mmiLine(board);
  const lines = summaryLines(board);

  const twitter = [
    "NSE F&O bubbles map — who’s at support vs resistance.",
    "",
    mmi,
    ...lines,
    "",
    `Live map → ${url}`,
  ]
    .filter((l) => l != null && l !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const facebook = [
    "Quick market map before you dig in.",
    "",
    mmi,
    ...lines,
    "",
    "Educational levels only — not a trade call.",
    "",
    `Open the bubbles map → ${url}`,
  ]
    .filter((l) => l != null && l !== "")
    .join("\n");

  const linkedin = [
    "FNO Ninja morning map: open-interest support & resistance across the NSE F&O universe.",
    "",
    mmi,
    ...lines,
    "",
    "For independent research only — not investment advice.",
    "",
    url,
  ]
    .filter((l) => l != null && l !== "")
    .join("\n");

  const instagram = [
    "Bubbles map — support & resistance",
    "",
    mmi,
    ...lines,
    "",
    "Educational only — not advice.",
    "",
    `Live map → ${url}`,
  ]
    .filter((l) => l != null && l !== "")
    .join("\n");

  return { twitter, facebook, linkedin, instagram };
}
