"use client";

import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { HeatmapAutoSwitch } from "@/components/simulator/HeatmapAutoSwitch";
import { ZoneBotControls } from "@/components/simulator/ZoneBotControls";

const ZONE_ASSETS = new Set<string>(["btc", "eth", "sol"]);

/** Config trigger on every cockpit card — crypto uses full macro sheet, zones use per-asset settings. */
export function BotCardControls({
  botId,
  label,
  onStatusChange,
}: {
  botId: CockpitBotId;
  label: string;
  onStatusChange?: (status: CockpitBotStatus) => void;
}) {
  if (botId === "crypto") {
    return <HeatmapAutoSwitch onStatusChange={onStatusChange} />;
  }
  if (ZONE_ASSETS.has(botId)) {
    return (
      <ZoneBotControls
        asset={botId as ZoneBotAsset}
        label={label}
        onStatusChange={onStatusChange}
      />
    );
  }
  return null;
}
