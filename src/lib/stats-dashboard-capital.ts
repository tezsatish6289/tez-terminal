import type { BotSourceFilter } from "@/lib/bot-source-filter";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import type { SimulatorState } from "@/lib/simulator";
import {
  ZONE_BOT_STARTING_CAPITAL_USD,
  type ZoneBotAsset,
} from "@/lib/zone-bot-config";

export type ZoneSimStatesMap = Partial<
  Record<ZoneBotAsset, Pick<SimulatorState, "capital" | "startingCapital">>
>;

const ZONE_ASSET_BY_SOURCE = new Map(
  CRYPTO_BOTS.filter((b) => b.id !== "crypto").map(
    (b) => [b.botSource, b.id as ZoneBotAsset] as const,
  ),
);

/** Starting capital for headline metrics + charts on /stats. */
export function startingCapitalForStatsFilter(
  filter: BotSourceFilter,
  sharedSimState: Pick<SimulatorState, "startingCapital"> | null | undefined,
  zoneSimStates: ZoneSimStatesMap,
): number {
  const shared = sharedSimState?.startingCapital ?? ZONE_BOT_STARTING_CAPITAL_USD;

  if (filter === "ALL" || filter === "PATTERN") {
    return shared;
  }

  const zoneAsset = ZONE_ASSET_BY_SOURCE.get(filter);
  if (!zoneAsset) return shared;

  return (
    zoneSimStates[zoneAsset]?.startingCapital ?? ZONE_BOT_STARTING_CAPITAL_USD
  );
}
