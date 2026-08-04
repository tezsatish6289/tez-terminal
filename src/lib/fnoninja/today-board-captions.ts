import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  formatBoardPrice,
  type TodayBoardSnapshot,
  type TodayIndexBoard,
} from "@/lib/fnoninja/today-board-shared";
import type { SocialPlatformId } from "@/lib/social/platforms";

export const TODAY_BOARD_PUBLIC_URL = `${FNONINJA_SITE_URL}/today`;

/** Human captions for the morning levels board (image + link unfurl carry the numbers). */
export function buildTodayBoardCaptions(
  board: TodayBoardSnapshot,
): Partial<Record<SocialPlatformId, string>> {
  const nifty = board.indices.find((i) => i.symbol === "NIFTY");
  const bank = board.indices.find((i) => i.symbol === "BANKNIFTY");

  const niftyLine = lineFor(nifty, "Nifty");
  const bankLine = bank
    ? `Bank Nifty: support near ${formatBoardPrice(bank.putWall)}, resistance near ${formatBoardPrice(bank.callWall)} (spot ${formatBoardPrice(bank.spot)}).`
    : "";

  const twitter = [
    niftyLine,
    "",
    bankLine,
    "",
    `Live board → ${TODAY_BOARD_PUBLIC_URL}`,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const facebook = [
    "Quick look before the session.",
    "",
    niftyLine,
    bankLine,
    "",
    "Educational levels only — not a trade call.",
    "",
    `Full board (updates through the day) → ${TODAY_BOARD_PUBLIC_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  const linkedin = [
    "Pre-market levels note from FNO Ninja.",
    "",
    niftyLine,
    bankLine,
    "",
    "For independent research only — not investment advice.",
    "",
    TODAY_BOARD_PUBLIC_URL,
  ]
    .filter(Boolean)
    .join("\n");

  const instagram = [
    "Levels for today",
    "",
    niftyLine,
    bankLine,
    "",
    "Educational board only — not advice.",
    "",
    `Live board → ${TODAY_BOARD_PUBLIC_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { twitter, facebook, linkedin, instagram };
}

function lineFor(row: TodayIndexBoard | undefined, fallbackName: string): string {
  if (!row) return `${fallbackName} walls are on the board.`;
  return `${row.label}’s sitting around ${formatBoardPrice(row.spot)} — put wall near ${formatBoardPrice(row.putWall)}, call wall near ${formatBoardPrice(row.callWall)}, with max pain around ${formatBoardPrice(row.maxPain)}.`;
}
