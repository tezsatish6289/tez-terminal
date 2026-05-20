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
}: {
  trades: SimTrade[];
  maxSlots: number;
  cs: string;
  onSelectTrade: (t: SimTrade) => void;
  onForceClose?: (t: SimTrade) => void;
}) {
  const slots = Math.min(Math.max(maxSlots, 1), 6);
  const emptyCount = Math.max(0, slots - trades.length);

  return (
    <div className="space-y-4">
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
        {trades.map((trade) => (
          <OpenPositionCard
            key={trade.id ?? trade.signalId}
            trade={trade}
            cs={cs}
            onSelect={() => onSelectTrade(trade)}
            onForceClose={onForceClose ? () => onForceClose(trade) : undefined}
          />
        ))}
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
        "relative flex flex-col items-center justify-center rounded-xl border border-dashed",
        "border-white/[0.08] bg-white/[0.01] min-h-[140px] sm:min-h-[152px]",
        "text-center px-4 py-6",
      )}
    >
      <div className="absolute top-3 right-3 text-[9px] font-mono font-bold text-muted-foreground/25">
        #{index}
      </div>
      <div className="w-10 h-10 rounded-full border border-white/[0.06] bg-white/[0.02] flex items-center justify-center mb-3">
        <Activity className="w-4 h-4 text-muted-foreground/20" />
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
}: {
  trade: SimTrade;
  cs: string;
  onSelect: () => void;
  onForceClose?: () => void;
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
        "group relative flex flex-col rounded-xl border text-left transition-all w-full",
        "hover:border-accent/35 hover:shadow-lg hover:shadow-accent/5",
        positive
          ? "border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent"
          : "border-rose-500/15 bg-gradient-to-b from-rose-500/[0.05] to-transparent",
      )}
    >
      <div className="px-3.5 pt-3.5 pb-2 border-b border-white/[0.05]">
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

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <span className="text-muted-foreground/40 block text-[8px] uppercase tracking-wider mb-0.5">
              Entry
            </span>
            <span className="font-mono font-bold text-white/70">
              {formatPrice(trade.entryPrice, cs)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground/40 block text-[8px] uppercase tracking-wider mb-0.5">
              Mark
            </span>
            <span className="font-mono font-bold text-white/90">
              {formatPrice(trade.currentPrice, cs)}
            </span>
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
          <span className="ml-auto text-[9px] font-bold text-accent/80">
            {trade.confidenceScore}
          </span>
        </div>
      </div>
    </button>
  );
}
