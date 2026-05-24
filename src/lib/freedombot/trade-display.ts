/**
 * Shared types + helpers for rendering the FreedomBot trades panel.
 *
 * Used by:
 *   - User dashboard          (src/app/freedombot/dashboard/page.tsx)
 *   - Admin bot-user detail   (src/app/admin/bot-users/[deploymentId]/page.tsx)
 *
 * Both views consume the identical shape returned by:
 *   - GET /api/freedombot/my-trades                      (per user)
 *   - GET /api/admin/bot-deployments/[id]/trades         (per deployment)
 *
 * The shared `bestRealizedPnl` resolver runs server-side in both endpoints,
 * so the value + source label is already authoritative by the time it
 * reaches the client. These helpers just format / order / aggregate.
 */

export type RealizedPnlSource =
  | "override"
  | "exchange"
  | "events"
  | "prices"
  | "internal";

export interface Trade {
  id: string;
  exchange?: string | null;
  symbol: string;
  side: string;
  status: string;
  /** Effective P&L resolved server-side via shared `bestRealizedPnl`. */
  realizedPnl: number;
  /** Which input the API picked. Null when the trade is open. */
  realizedPnlSource?: RealizedPnlSource | null;
  realizedPnlInternal?: number;
  realizedPnlExchange?: number | null;
  exchangeRealizedPnlOverride?: number | null;
  exchangePnlReconciledAt?: string | null;
  unrealizedPnl: number;
  positionSize: number | null;
  leverage: number;
  entryPrice: number | null;
  currentPrice: number | null;
  capitalAtEntry?: number | null;
  blockchainTxHash?: string | null;
  openedAt: string | null;
  closedAt: string | null;
  botSource?: string | null;
}

// ── Formatters ──────────────────────────────────────────────────────────────

export function formatPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 100) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/** Signed USD for P&L lines (uses Unicode minus for losses). */
export function formatSignedUsd(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `\u2212$${abs}`;
  return `$${abs}`;
}

// ── Time helpers ────────────────────────────────────────────────────────────

export function closedAtMs(t: Trade): number {
  if (!t.closedAt) return 0;
  const ms = new Date(t.closedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function openedAtMs(t: Trade): number {
  if (!t.openedAt) return 0;
  const ms = new Date(t.openedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** When exchange (or override) PnL became authoritative — drives passbook order. */
export function pnlBookedAtMs(t: Trade): number {
  if (t.exchangePnlReconciledAt) {
    const ms = new Date(t.exchangePnlReconciledAt).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return closedAtMs(t) || openedAtMs(t);
}

/**
 * Open positions first (newest entry first), then all closed rows by latest
 * exit first (`closedAt`). Pending venue PnL doesn't sink below older booked
 * closes on page 1.
 */
export function sortTradesForDashboard(list: Trade[]): Trade[] {
  const closed = list.filter((t) => t.status === "closed");
  const open = list.filter((t) => t.status === "open");
  const sortedClosedDesc = [...closed].sort((a, b) => {
    const d = closedAtMs(b) - closedAtMs(a);
    if (d !== 0) return d;
    return b.id.localeCompare(a.id);
  });
  const sortedOpenDesc = [...open].sort((a, b) => openedAtMs(b) - openedAtMs(a));
  return [...sortedOpenDesc, ...sortedClosedDesc];
}

// ── PnL resolution + cumulative ─────────────────────────────────────────────

/**
 * Best available closed-trade P&L for display, with provenance.
 * Wraps the server-resolved `realizedPnl` + `realizedPnlSource` fields with
 * a null-safety check so callers can use the same null pattern.
 */
export function bestClosedPnl(
  t: Trade,
): { value: number; source: RealizedPnlSource } | null {
  if (t.status !== "closed") return null;
  if (!t.realizedPnlSource) return null;
  if (typeof t.realizedPnl !== "number" || Number.isNaN(t.realizedPnl)) return null;
  return { value: t.realizedPnl, source: t.realizedPnlSource };
}

/** True when the row's value is one of the pre-sync sources (events/prices/internal). */
export function isPreliminarySource(source: RealizedPnlSource | null | undefined): boolean {
  return source === "events" || source === "prices" || source === "internal";
}

/** Open: always show refresh. Closed: only until override or exchange PnL exists. */
export function tradeShowsResyncControl(t: Trade): boolean {
  if (t.status === "open") return true;
  if (typeof t.exchangeRealizedPnlOverride === "number" && !Number.isNaN(t.exchangeRealizedPnlOverride)) return false;
  return t.realizedPnlExchange == null;
}

/**
 * Passbook cumulative: assigns a running-total P&L to each closed trade.
 *
 * Two modes:
 *   1. **Forward sum** (default, used when the caller has every closed trade
 *      in memory). Walk closes in booking time ascending; cumulative[t] is
 *      the running sum up to and including t.
 *   2. **Anchored backward** (used when `anchor.lifetimeRealizedPnl` is
 *      provided — typical with pagination). The lifetime is known from the
 *      server-cached aggregate; we walk the loaded closes in booking time
 *      descending, starting at lifetime, subtracting one row's value on each
 *      step. This gives the correct cumulative for whatever subset the
 *      client happens to have loaded — pages no longer underreport totals.
 */
export function cumulativeBestPnlByTradeId(
  list: Trade[],
  anchor?: { lifetimeRealizedPnl: number },
): Map<string, number | null> {
  const closed = list.filter((t) => t.status === "closed");
  const map = new Map<string, number | null>();

  if (anchor && Number.isFinite(anchor.lifetimeRealizedPnl)) {
    const desc = [...closed].sort((a, b) => {
      const ta = pnlBookedAtMs(a);
      const tb = pnlBookedAtMs(b);
      if (ta !== tb) return tb - ta;
      return b.id.localeCompare(a.id);
    });
    let running = anchor.lifetimeRealizedPnl;
    for (const t of desc) {
      const best = bestClosedPnl(t);
      map.set(t.id, best != null ? running : null);
      if (best != null) running -= best.value;
    }
    return map;
  }

  const chrono = [...closed].sort((a, b) => {
    const ta = pnlBookedAtMs(a);
    const tb = pnlBookedAtMs(b);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  let sum = 0;
  for (const t of chrono) {
    const best = bestClosedPnl(t);
    if (best != null) sum += best.value;
    map.set(t.id, best != null ? sum : null);
  }
  return map;
}

/** True if any closed trade is showing a preliminary value — drives the warning banner. */
export function anyTradeIsPreliminary(list: Trade[]): boolean {
  return list.some((t) => {
    const best = bestClosedPnl(t);
    return best != null && isPreliminarySource(best.source);
  });
}

/** Sum of the best available P&L for all closed trades. */
export function totalClosedPnl(list: Trade[]): number {
  return list.reduce((sum, t) => {
    const best = bestClosedPnl(t);
    return best != null ? sum + best.value : sum;
  }, 0);
}

/** Tooltip copy keyed by source — shared so it's identical everywhere. */
export function pnlSourceTooltip(source: RealizedPnlSource | null | undefined): string | undefined {
  switch (source) {
    case "override":
      return "Manually corrected P&L.";
    case "exchange":
      return "Realised P&L reported by the exchange (net of fees).";
    case "events":
      return "Preliminary P&L computed from each TP/SL fill recorded for this trade (gross of fees). The exchange's realised P&L will replace this within a minute or so.";
    case "prices":
      return "Preliminary P&L computed from entry, exit, and position size (gross of fees). The exchange's realised P&L will replace this within a minute or so.";
    case "internal":
      return "Preliminary P&L from the bot's TP/SL model. The exchange's realised P&L will replace this once the venue indexes the close.";
    default:
      return undefined;
  }
}
