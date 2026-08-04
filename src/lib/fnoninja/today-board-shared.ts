export const TODAY_BOARD_SYMBOLS = ["NIFTY", "BANKNIFTY"] as const;
export type TodayBoardSymbol = (typeof TODAY_BOARD_SYMBOLS)[number];

export type TodayIndexBoard = {
  symbol: TodayBoardSymbol;
  label: string;
  spot: number | null;
  putWall: number | null;
  callWall: number | null;
  maxPain: number | null;
  putOi: number | null;
  callOi: number | null;
  expiry: string | null;
  computedAt: string | null;
};

export type TodayBoardSnapshot = {
  indices: TodayIndexBoard[];
  updatedAt: string | null;
};

export function formatBoardPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

export function formatBoardAsOf(iso: string | null | undefined): string {
  if (!iso) return "latest available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "latest available";
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

/** OG / meta title with live numbers when present. */
export function todayBoardMetaTitle(board: TodayBoardSnapshot): string {
  const nifty = board.indices.find((i) => i.symbol === "NIFTY");
  if (nifty?.putWall != null && nifty?.callWall != null) {
    return `Nifty walls today — put ${formatBoardPrice(nifty.putWall)} · call ${formatBoardPrice(nifty.callWall)}`;
  }
  return "Levels today — Nifty & Bank Nifty walls";
}

export function todayBoardMetaDescription(board: TodayBoardSnapshot): string {
  const parts = board.indices.map((i) => {
    if (i.spot == null && i.putWall == null) return null;
    return `${i.label}: spot ${formatBoardPrice(i.spot)}, put ${formatBoardPrice(i.putWall)}, call ${formatBoardPrice(i.callWall)}, max pain ${formatBoardPrice(i.maxPain)}`;
  });
  const body = parts.filter(Boolean).join(". ");
  const asOf = formatBoardAsOf(board.updatedAt);
  if (!body) {
    return `Live option-wall board for Nifty and Bank Nifty. Educational levels only — not investment advice. Updated ${asOf}.`;
  }
  return `${body}. As of ${asOf}. Educational board — not investment advice.`;
}
