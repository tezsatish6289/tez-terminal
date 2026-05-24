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
/** Track record length for headline cards — per-bot when filtered, global when All Bots. */
export function runningDaysForStatsFilter(
  filter: BotSourceFilter,
  serverRunningDays: number | undefined,
  closedTrades: { openedAt?: string | null }[],
): number {
  if (filter === "ALL" && serverRunningDays != null && serverRunningDays > 0) {
    return serverRunningDays;
  }
  if (!closedTrades.length) return 0;
  const earliest = closedTrades.reduce((a, b) => {
    const ta = new Date(a.openedAt ?? 0).getTime();
    const tb = new Date(b.openedAt ?? 0).getTime();
    return ta < tb ? a : b;
  });
  const opened = earliest.openedAt;
  if (!opened) return 0;
  return Math.max(
    1,
    Math.ceil((Date.now() - new Date(opened).getTime()) / 86_400_000),
  );
}

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
