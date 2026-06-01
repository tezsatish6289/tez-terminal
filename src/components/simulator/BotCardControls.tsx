"use client";

import { useMemo } from "react";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { evaluateManualEntryGate } from "@/lib/cockpit-manual-gate";
import { cn } from "@/lib/utils";
import { SimBotConfigSheet } from "@/components/simulator/SimBotConfigSheet";
import { ManualTradeSheet } from "@/components/simulator/ManualTradeSheet";

/** Per-bot Manual + Config + AUTO on every cockpit card. */
export function BotCardControls({
  botId,
  label,
  capital,
  suggested,
  onStatusChange,
  onTradeOpened,
  stacked = false,
}: {
  botId: CockpitBotId;
  label: string;
  capital: number;
  suggested: SuggestedZonesSnapshot | null;
  onStatusChange?: (status: CockpitBotStatus) => void;
  onTradeOpened?: () => void;
  /** Vertical stack for the cockpit detail card's left rail. */
  stacked?: boolean;
}) {
  const manualGate = useMemo(
    () => evaluateManualEntryGate(suggested),
    [suggested],
  );

  return (
    <div
      data-heatmap-toolbar=""
      className={cn(
        "shrink-0 relative z-10",
        stacked ? "flex flex-col gap-2.5 w-full" : "flex items-center gap-1",
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ManualTradeSheet
        botId={botId}
        label={label}
        capital={capital}
        manualGate={manualGate}
        onOpened={onTradeOpened}
        stacked={stacked}
      />
      <SimBotConfigSheet
        botId={botId}
        label={label}
        onStatusChange={onStatusChange}
        stacked={stacked}
      />
    </div>
  );
}
