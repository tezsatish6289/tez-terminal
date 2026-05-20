"use client";

import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { SimBotConfigSheet } from "@/components/simulator/SimBotConfigSheet";
import { ManualTradeSheet } from "@/components/simulator/ManualTradeSheet";

/** Per-bot Manual + Config + AUTO on every cockpit card. */
export function BotCardControls({
  botId,
  label,
  capital,
  onStatusChange,
  onTradeOpened,
}: {
  botId: CockpitBotId;
  label: string;
  capital: number;
  onStatusChange?: (status: CockpitBotStatus) => void;
  onTradeOpened?: () => void;
}) {
  return (
    <div
      data-heatmap-toolbar=""
      className="flex items-center gap-1 shrink-0 relative z-10"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ManualTradeSheet botId={botId} label={label} capital={capital} onOpened={onTradeOpened} />
      <SimBotConfigSheet
        botId={botId}
        label={label}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}
