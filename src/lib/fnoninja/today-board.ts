import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { indexDocId } from "@/lib/index-zones-store";
import type { IndexKey } from "@/lib/index-options-zones";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  TODAY_BOARD_SYMBOLS,
  type TodayBoardSnapshot,
  type TodayBoardSymbol,
  type TodayIndexBoard,
} from "@/lib/fnoninja/today-board-shared";

export type { TodayBoardSnapshot, TodayBoardSymbol, TodayIndexBoard };
export {
  TODAY_BOARD_SYMBOLS,
  formatBoardAsOf,
  formatBoardPrice,
  todayBoardMetaDescription,
  todayBoardMetaTitle,
} from "@/lib/fnoninja/today-board-shared";

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function labelFor(symbol: TodayBoardSymbol): string {
  return symbol === "BANKNIFTY" ? "Bank Nifty" : "Nifty";
}

async function loadIndexBoard(symbol: TodayBoardSymbol): Promise<TodayIndexBoard> {
  const db = getAdminFirestore();
  const snap = await db.doc(indexDocId(symbol as IndexKey)).get();
  const raw = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  if (!raw) {
    return {
      symbol,
      label: labelFor(symbol),
      spot: null,
      putWall: null,
      callWall: null,
      maxPain: null,
      putOi: null,
      callOi: null,
      expiry: null,
      computedAt: null,
    };
  }

  return {
    symbol,
    label: labelFor(symbol),
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    putWall: num(raw.bullStrike),
    callWall: num(raw.bearStrike),
    maxPain: num(raw.maxPain),
    putOi: num(raw.bullOI),
    callOi: num(raw.bearOI),
    expiry: typeof raw.expiryUsed === "string" ? raw.expiryUsed : null,
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
  };
}

/** Latest Nifty + BankNifty walls for the public /today board + OG card. */
export async function loadTodayBoard(): Promise<TodayBoardSnapshot> {
  const indices = await Promise.all(TODAY_BOARD_SYMBOLS.map((s) => loadIndexBoard(s)));
  const times = indices
    .map((i) => i.computedAt)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .sort();
  return {
    indices,
    updatedAt: times.length ? times[times.length - 1]! : null,
  };
}

export function fnoTodayAbsoluteUrl(): string {
  return `${FNONINJA_SITE_URL}/today`;
}

export function fnoReplayAbsoluteUrl(id: string): string {
  return `${FNONINJA_SITE_URL}/replay/${encodeURIComponent(id)}`;
}
