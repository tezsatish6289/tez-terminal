"use client";

import { useMemo } from "react";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { evaluateManualEntryGate } from "@/lib/cockpit-manual-gate";
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
}: {
  botId: CockpitBotId;
  label: string;
  capital: number;
  suggested: SuggestedZonesSnapshot | null;
  onStatusChange?: (status: CockpitBotStatus) => void;
  onTradeOpened?: () => void;
}) {
  const manualGate = useMemo(
    () => evaluateManualEntryGate(suggested),
    [suggested],
  );

  return (
    <div
      data-heatmap-toolbar=""
      className="flex items-center gap-1 shrink-0 relative z-10"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ManualTradeSheet
        botId={botId}
        label={label}
        capital={capital}
        manualGate={manualGate}
        onOpened={onTradeOpened}
      />
      <SimBotConfigSheet
        botId={botId}
        label={label}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}
