"use client";

import Link from "next/link";
import {
  Activity,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SimTrade } from "@/lib/simulator";
import {
  SIM_CARD_INTERACTIVE,
  SIM_SLOT_EMPTY,
} from "@/components/simulator/simulator-surfaces";
import {
  LiveMirrorExchangeBar,
  LiveMirrorSymbolLink,
} from "@/components/simulator/OpenTradesLiveMirrors";
import type {
  ExchangeMirrorSummary,
  LiveMirrorTrade,
} from "@/lib/admin/live-mirror-display";
import { SimNotionalSizeDisplay } from "@/components/simulator/SimNotionalSize";

function simTradeIdFor(trade: SimTrade): string {
  return trade.id ?? (trade.signalId ? `sim-${trade.signalId}` : "");
}

const tfLabelMap: Record<string, string> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1D",
};

function formatPrice(val: number | null | undefined, cs: string): string {
  if (val == null || val === 0) return "—";
  if (val >= 100)
    return `${cs}${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  if (val >= 1)
    return `${cs}${val.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })}`;
  return `${cs}${val.toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })}`;
}

function formatMoney(val: number | null | undefined, cs: string): string {
  if (val == null || !Number.isFinite(val)) return `${cs}0.00`;
  return `${cs}${val.toFixed(2)}`;
}

/** Cockpit grid for live positions — max ~5 slots, empty slots shown as
 *  placeholders so the panel never looks broken when idle. */
export function OpenPositionsPanel({
  trades,
  maxSlots,
  cs,
  onSelectTrade,
  onForceClose,
  showMirrorUi = false,
  mirrorsBySimTradeId = {},
  exchangeSummary = [],
  mirrorsLoading = false,
  mirrorsError = null,
  openSimTradeIds = [],
}: {
  trades: SimTrade[];
  maxSlots: number;
  cs: string;
  onSelectTrade: (t: SimTrade) => void;
  onForceClose?: (t: SimTrade) => void;
  showMirrorUi?: boolean;
  mirrorsBySimTradeId?: Record<string, LiveMirrorTrade[]>;
  exchangeSummary?: ExchangeMirrorSummary[];
  mirrorsLoading?: boolean;
  mirrorsError?: string | null;
  openSimTradeIds?: string[];
}) {
  const slots = Math.min(Math.max(maxSlots, 1), 6);
  const emptyCount = Math.max(0, slots - trades.length);

  return (
    <div className="space-y-4">
      {showMirrorUi && (
        <LiveMirrorExchangeBar
          exchangeSummary={exchangeSummary}
          loading={mirrorsLoading}
          error={mirrorsError}
          simTradeIds={openSimTradeIds}
        />
      )}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] text-muted-foreground/50 max-w-md">
          Up to <span className="text-foreground/70 font-bold">{slots}</span>{" "}
          concurrent positions. Slots free up when a trade closes or hits TP/SL.
        </p>
        {trades.length === 0 && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/35 shrink-0">
            Waiting for signal
          </span>
        )}
      </div>

      <div
        className={cn(
          "grid gap-3",
          slots <= 3
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        )}
      >
        {trades.map((trade) => {
          const simId = simTradeIdFor(trade);
          const mirrorCount = simId ? (mirrorsBySimTradeId[simId]?.length ?? 0) : 0;
          return (
            <OpenPositionCard
              key={trade.id ?? trade.signalId}
              trade={trade}
              cs={cs}
              onSelect={() => onSelectTrade(trade)}
              onForceClose={onForceClose ? () => onForceClose(trade) : undefined}
              simTradeId={simId}
              mirrorCount={mirrorCount}
              showMirrorUi={showMirrorUi}
            />
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptySlot key={`empty-${i}`} index={trades.length + i + 1} />
        ))}
      </div>
    </div>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className={cn(
        SIM_SLOT_EMPTY,
        "relative flex flex-col items-center justify-center min-h-[140px] sm:min-h-[152px]",
        "text-center px-4 py-6",
      )}
    >
      <div className="absolute top-3 right-3 text-[9px] font-mono font-bold text-muted-foreground/30">
        #{index}
      </div>
      <div className="w-10 h-10 rounded-full border border-white/[0.12] bg-[#1a1a1f] shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] flex items-center justify-center mb-3">
        <Activity className="w-4 h-4 text-muted-foreground/30" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/30">
        Slot open
      </span>
      <span className="text-[9px] text-muted-foreground/20 mt-1 max-w-[120px]">
        Next qualified signal fills here
      </span>
    </div>
  );
}

function OpenPositionCard({
  trade,
  cs,
  onSelect,
  onForceClose,
  simTradeId = "",
  mirrorCount = 0,
  showMirrorUi = false,
}: {
  trade: SimTrade;
  cs: string;
  onSelect: () => void;
  onForceClose?: () => void;
  simTradeId?: string;
  mirrorCount?: number;
  showMirrorUi?: boolean;
}) {
  const isBuy = trade.side === "BUY";
  const pnl = trade.unrealizedPnl ?? 0;
  const positive = pnl >= 0;
  const chartLabel =
    tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        SIM_CARD_INTERACTIVE,
        "group relative flex flex-col text-left w-full",
        positive
          ? "border-emerald-500/30 bg-[#141a18] hover:border-emerald-500/45 hover:shadow-[0_14px_36px_-10px_rgba(0,0,0,0.85),0_4px_16px_-4px_rgba(16,185,129,0.15)]"
          : "border-rose-500/25 bg-[#1a1416] hover:border-rose-500/40 hover:shadow-[0_14px_36px_-10px_rgba(0,0,0,0.85),0_4px_16px_-4px_rgba(244,63,94,0.12)]",
      )}
    >
      <div className="px-3.5 pt-3.5 pb-2 border-b border-white/[0.1] bg-[#1c1c21]/80">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/chart/${trade.signalId}`}
              target="_blank"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-black text-white uppercase tracking-tight hover:text-accent truncate block"
            >
              {trade.symbol}
            </Link>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge
                className={cn(
                  "text-[8px] font-black h-4 px-1.5",
                  isBuy
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/20 text-rose-400",
                )}
              >
                {trade.side}
              </Badge>
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase">
                {chartLabel}
              </span>
              <span className="text-[9px] font-mono text-accent/80">
                {trade.leverage}×
              </span>
            </div>
          </div>
          {onForceClose && (
            <button
              type="button"
              title="Force close"
              onClick={(e) => {
                e.stopPropagation();
                onForceClose();
              }}
              className="shrink-0 p-1 rounded-md text-muted-foreground/30 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 py-3 flex-1 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
            Unrealized
          </span>
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-base font-black tabular-nums",
              positive ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {positive ? "+" : ""}
            {formatMoney(pnl, cs)}
          </span>
        </div>

        <div className="flex gap-2 text-[10px]">
          <div className="flex-1 min-w-0">
            <span className="text-muted-foreground/40 block text-[8px] uppercase tracking-wider mb-0.5">
              Entry
            </span>
            <span className="font-mono font-bold text-white/70">
              {formatPrice(trade.entryPrice, cs)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-muted-foreground/40 block text-[8px] uppercase tracking-wider mb-0.5">
              Mark
            </span>
            <span className="font-mono font-bold text-white/90">
              {formatPrice(trade.currentPrice, cs)}
            </span>
          </div>
          <div className="shrink-0 text-right min-w-[88px]">
            <span className="text-muted-foreground/40 block text-[8px] uppercase tracking-wider mb-0.5">
              Notional
            </span>
            <SimNotionalSizeDisplay
              trade={trade}
              cs={cs}
              useRemaining
              className="text-[10px] block text-right"
              valueClassName="text-white/80"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 pt-1 border-t border-white/[0.04]">
          {[
            { n: 1, hit: trade.tp1Hit },
            { n: 2, hit: trade.tp2Hit },
            { n: 3, hit: trade.tp3Hit },
          ].map((tp) => (
            <span
              key={tp.n}
              className={cn(
                "text-[8px] font-bold px-1.5 py-0.5 rounded",
                tp.hit
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/5 text-muted-foreground/35",
              )}
            >
              TP{tp.n}
              {tp.hit ? " ✓" : ""}
            </span>
          ))}
          <div className="ml-auto flex flex-col items-end gap-0.5">
            {showMirrorUi && (
              <LiveMirrorSymbolLink simTradeId={simTradeId} mirrorCount={mirrorCount} />
            )}
            <span
              className="text-[9px] font-bold text-accent/80"
              title="Entry confidence score"
            >
              Score {trade.confidenceScore}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
