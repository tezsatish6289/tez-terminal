"use client";

/**
 * Shared trades panel — used by both the user dashboard and the admin
 * bot-deployment detail page so both views stay in lockstep.
 *
 * Renders (top to bottom):
 *   1. Optional warning banner when any closed row is preliminary
 *   2. Empty state OR the trades table
 *   3. Optional "Load more" button
 *
 * The caller is responsible for:
 *   - Sorting + paginating the trades it passes in
 *   - Computing the cumulative map (use `cumulativeBestPnlByTradeId`)
 *   - Implementing `onRefreshTrade(tradeId)` — when omitted, the per-row
 *     refresh icon is hidden.
 */

import { useState } from "react";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import {
  type Trade,
  bestClosedPnl,
  formatPrice,
  formatSignedUsd,
  isPreliminarySource,
  pnlSourceTooltip,
  tradeShowsResyncControl,
} from "@/lib/freedombot/trade-display";

const COLUMNS = "1.35fr 1.55fr 0.9fr 0.9fr 0.9fr 0.85fr 1fr 0.75fr";

const HEADER_LABELS: Array<{ label: string; tip: string }> = [
  { label: "Entry | Exit Time", tip: "" },
  { label: "Side & Symbol", tip: "" },
  { label: "Size & Leverage", tip: "" },
  { label: "Entry Price", tip: "" },
  { label: "Exit Price", tip: "" },
  { label: "P&L", tip: "" },
  {
    label: "Cumulative",
    tip: "Running total after each close (oldest first by booking time). Uses the exchange's realised P&L when available, otherwise the bot's preliminary calculation. The table sorts closes by latest exit; cumulative follows booking order, so values may not increase top-to-bottom.",
  },
  { label: "Status", tip: "" },
];

export interface TradesPanelProps {
  /** Already sorted + paginated by the caller. */
  trades: Trade[];
  /** Map of trade id → cumulative best-pnl for closed trades. */
  cumulativeByTradeId: Map<string, number | null>;
  /** Show the yellow preliminary-PnL banner above the table. */
  showWarningBanner: boolean;
  /** True while the parent is loading the very first page. Drives the spinner. */
  isInitiallyLoading?: boolean;
  /** Per-row refresh handler. Omit to hide the refresh icon entirely. */
  onRefreshTrade?: (tradeId: string) => Promise<void>;
  /** Called when the user clicks "Load more". Omit to hide the button. */
  onLoadMore?: () => void;
  /** True while the next page is fetching — disables the button and shows a label. */
  loadingMore?: boolean;
  /** Whether more rows are available beyond what's already shown. */
  hasMore?: boolean;
  /** Optional remaining-count label (e.g. "Load more (50 of 27 remaining)"). */
  loadMoreLabel?: string;
  /** Empty-state copy; defaults are dashboard-friendly. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function TradesPanel({
  trades,
  cumulativeByTradeId,
  showWarningBanner,
  isInitiallyLoading,
  onRefreshTrade,
  onLoadMore,
  loadingMore,
  hasMore,
  loadMoreLabel,
  emptyTitle = "No trades yet",
  emptySubtitle = "Trades will appear here once your bot starts placing orders",
}: TradesPanelProps) {
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const refreshOne = async (tradeId: string) => {
    if (!onRefreshTrade) return;
    setRefreshingIds((prev) => new Set(prev).add(tradeId));
    try {
      await onRefreshTrade(tradeId);
    } finally {
      setRefreshingIds((prev) => {
        const s = new Set(prev);
        s.delete(tradeId);
        return s;
      });
    }
  };

  return (
    <div className="space-y-3">
      {showWarningBanner && (
        <div
          className="rounded-2xl px-4 py-3 text-xs font-semibold leading-relaxed flex items-start gap-2"
          style={{
            backgroundColor: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.18)",
            color: "#fcd34d",
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: "#fbbf24" }}
          />
          <span>
            Rows marked with a yellow dot show a preliminary P&amp;L computed from
            each TP/SL fill recorded for that trade (gross of fees). The
            exchange&apos;s verified realised P&amp;L replaces it as soon as the
            venue indexes those exits — usually within a minute.
            {onRefreshTrade
              ? " Click the refresh icon on any row to force an immediate sync."
              : ""}
          </span>
        </div>
      )}

      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(90,140,220,0.12)" }}
      >
        {/* Desktop header */}
        <div
          className="hidden sm:grid px-4 py-3 gap-1"
          style={{
            gridTemplateColumns: COLUMNS,
            backgroundColor: "#060d1a",
            borderBottom: "1px solid rgba(90,140,220,0.1)",
          }}
        >
          {HEADER_LABELS.map(({ label, tip }) => (
            <div
              key={label}
              className="text-[9px] font-bold uppercase tracking-widest min-w-0"
              style={{ color: "#334155" }}
              title={tip || undefined}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Empty / loading state */}
        {isInitiallyLoading && trades.length === 0 && (
          <div className="flex justify-center py-16" style={{ backgroundColor: "#0a1628" }}>
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}

        {!isInitiallyLoading && trades.length === 0 && (
          <div className="py-16 text-center" style={{ backgroundColor: "#0a1628" }}>
            <Zap className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.2)" }}>
              {emptyTitle}
            </p>
            <p className="text-xs mt-1" style={{ color: "#334155" }}>
              {emptySubtitle}
            </p>
          </div>
        )}

        {trades.map((trade, i, arr) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            isLast={i === arr.length - 1}
            cumulative={cumulativeByTradeId.get(trade.id)}
            isRefreshing={refreshingIds.has(trade.id)}
            onRefresh={onRefreshTrade ? () => refreshOne(trade.id) : undefined}
          />
        ))}
      </div>

      {hasMore && onLoadMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold uppercase tracking-wider text-accent hover:bg-white/[0.08] disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : loadMoreLabel ?? "Load more"}
        </button>
      )}
    </div>
  );
}

interface TradeRowProps {
  trade: Trade;
  isLast: boolean;
  cumulative: number | null | undefined;
  isRefreshing: boolean;
  onRefresh?: () => void;
}

function TradeRow({ trade, isLast, cumulative, isRefreshing, onRefresh }: TradeRowProps) {
  const isOpen = trade.status === "open";
  const closedBest = !isOpen ? bestClosedPnl(trade) : null;
  const closedPnl = closedBest?.value ?? null;
  const isPreliminary = isPreliminarySource(closedBest?.source);
  const openPnl = isOpen ? trade.unrealizedPnl : 0;
  const pnlDisplay = isOpen
    ? formatSignedUsd(openPnl)
    : closedPnl != null
      ? formatSignedUsd(closedPnl)
      : "—";
  const isWin = isOpen ? openPnl >= 0 : closedPnl != null && closedPnl >= 0;
  const isBuy = trade.side === "LONG" || trade.side === "BUY";
  const showResync = !!onRefresh && tradeShowsResyncControl(trade);
  const rowStyle = { borderBottom: !isLast ? "1px solid rgba(90,140,220,0.06)" : "none" };
  const winColor = isPreliminary ? "rgba(52,211,153,0.65)" : "#34d399";
  const lossColor = isPreliminary ? "rgba(248,113,113,0.65)" : "#f87171";
  const pnlColor = !isOpen && closedPnl == null
    ? "#475569"
    : isWin
      ? winColor
      : lossColor;
  const pnlTooltip = pnlSourceTooltip(closedBest?.source);

  return (
    <div>
      {/* Mobile */}
      <div
        className="sm:hidden flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundColor: "#0a1628", ...rowStyle }}
      >
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase flex-shrink-0"
              style={
                isBuy
                  ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" }
                  : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }
              }
            >
              {isBuy ? "Buy" : "Sell"}
            </span>
            <span
              className="text-sm font-black text-white truncate min-w-0"
              title={trade.symbol}
            >
              {trade.symbol}
            </span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: "#475569" }}>
            {trade.openedAt
              ? new Date(trade.openedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="font-mono text-sm font-black inline-flex items-center gap-1"
            style={{ color: pnlColor }}
            title={pnlTooltip}
          >
            {isPreliminary && (
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ backgroundColor: "#fbbf24" }}
                aria-label="Preliminary P&L"
              />
            )}
            {pnlDisplay}
          </span>
          {!isOpen && cumulative != null && (
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color: cumulative >= 0 ? "#34d399" : "#f87171" }}
            >
              Σ {formatSignedUsd(cumulative)}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={
                isOpen
                  ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" }
                  : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }
              }
            >
              {isOpen ? "Open" : "Closed"}
            </span>
            {showResync && onRefresh && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onRefresh();
                }}
                disabled={isRefreshing}
                title={isOpen ? "Sync from exchange" : "Fetch exchange P&L for this close"}
                className="p-1 rounded"
                style={{ color: isRefreshing ? "#60a5fa" : "#334155" }}
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div
        className="hidden sm:grid px-4 py-3.5 gap-1 items-center hover:bg-white/[0.015] transition-colors"
        style={{
          gridTemplateColumns: COLUMNS,
          backgroundColor: "#0a1628",
          ...rowStyle,
        }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "#334155" }}>
              In
            </span>
            <span className="text-[10px] font-mono font-bold" style={{ color: "#60a5fa" }}>
              {trade.openedAt
                ? new Date(trade.openedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
          {trade.closedAt && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "#334155" }}>
                Out
              </span>
              <span className="text-[10px] font-mono" style={{ color: "#475569" }}>
                {new Date(trade.closedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
            style={
              isBuy
                ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" }
                : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }
            }
          >
            {isBuy ? "Buy" : "Sell"}
          </span>
          <span
            className="text-sm font-black text-white leading-none truncate min-w-0"
            title={trade.symbol}
          >
            {trade.symbol}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-bold" style={{ color: "#94a3b8" }}>
            {trade.positionSize ? `$${trade.positionSize.toFixed(2)}` : "—"}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex w-fit"
            style={{ backgroundColor: "rgba(96,165,250,0.08)", color: "#60a5fa" }}
          >
            {trade.leverage}x
          </span>
        </div>

        <div className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
          ${formatPrice(trade.entryPrice)}
        </div>

        <div className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
          {isOpen ? (
            <span style={{ color: "#334155" }}>—</span>
          ) : (
            `$${formatPrice(trade.currentPrice)}`
          )}
        </div>

        <div className="font-mono text-xs font-black min-w-0 flex flex-col gap-0.5">
          <span
            className="inline-flex items-center gap-1"
            style={{ color: pnlColor }}
            title={pnlTooltip}
          >
            {isPreliminary && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "#fbbf24" }}
                aria-label="Preliminary P&L"
              />
            )}
            {pnlDisplay}
          </span>
        </div>

        <div className="font-mono text-[11px] font-bold min-w-0" style={{ color: "#94a3b8" }}>
          {isOpen ? (
            <span style={{ color: "#334155" }} title="Cumulative applies after a trade is closed">
              —
            </span>
          ) : cumulative != null ? (
            <span
              style={{ color: cumulative >= 0 ? "#34d399" : "#f87171" }}
              title="Sum of best-available realised P&L through this close"
            >
              {formatSignedUsd(cumulative)}
            </span>
          ) : (
            <span style={{ color: "#334155" }}>—</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-black px-2 py-1 rounded uppercase tracking-wide"
            style={
              isOpen
                ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" }
                : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }
            }
          >
            {isOpen ? "Open" : "Closed"}
          </span>
          {showResync && onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void onRefresh();
              }}
              disabled={isRefreshing}
              title={isOpen ? "Sync from exchange" : "Fetch exchange P&L for this close"}
              className="p-1 rounded transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed"
              style={{ color: isRefreshing ? "#60a5fa" : "#334155" }}
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
