"use client";

import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { SimBotConfigSheet } from "@/components/simulator/SimBotConfigSheet";

/** Per-bot Config + AUTO on every cockpit card. */
export function BotCardControls({
  botId,
  label,
  onStatusChange,
}: {
  botId: CockpitBotId;
  label: string;
  onStatusChange?: (status: CockpitBotStatus) => void;
}) {
  return (
    <SimBotConfigSheet
      botId={botId}
      label={label}
      onStatusChange={onStatusChange}
    />
  );
}
