"use client";

import { cn } from "@/lib/utils";

export interface SimPositionSizing {
  marginUsd: number;
  leverage: number;
  notionalUsd: number;
}

export function getSimPositionSizing(
  trade: {
    positionSize?: number | null;
    leverage?: number | null;
    remainingPct?: number | null;
  },
  opts?: { useRemaining?: boolean },
): SimPositionSizing {
  const leverage = trade.leverage ?? 1;
  const pct = opts?.useRemaining ? (trade.remainingPct ?? 1) : 1;
  const marginUsd = (trade.positionSize ?? 0) * pct;
  return {
    marginUsd,
    leverage,
    notionalUsd: marginUsd * leverage,
  };
}

function formatMoney(val: number, cs: string): string {
  if (!Number.isFinite(val)) return `${cs}0.00`;
  return `${cs}${val.toFixed(2)}`;
}

/** Margin · leverage · notional — shared on open cards and history. */
export function SimNotionalSizeDisplay({
  trade,
  cs,
  useRemaining = false,
  className,
  valueClassName,
}: {
  trade: {
    positionSize?: number | null;
    leverage?: number | null;
    remainingPct?: number | null;
  };
  cs: string;
  /** Open positions: scale margin by remaining % after partial TPs. */
  useRemaining?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  const { marginUsd, leverage, notionalUsd } = getSimPositionSizing(trade, {
    useRemaining,
  });

  return (
    <span
      className={cn("font-mono tabular-nums leading-snug", className)}
      title="Margin · leverage · notional"
    >
      <span className={cn("font-bold", valueClassName)}>
        {formatMoney(marginUsd, cs)}
        <span className="text-muted-foreground/45 font-bold"> · </span>
        <span className="text-accent/75">{leverage}×</span>
        <span className="text-muted-foreground/45 font-bold"> · </span>
        {formatMoney(notionalUsd, cs)}
      </span>
    </span>
  );
}
