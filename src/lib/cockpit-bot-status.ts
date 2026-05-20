import type { ZoneBotState } from "@/lib/zone-bot-state";
import type { ZoneBotSettings } from "@/lib/zone-bot-config";

export type CockpitBotPower = "on" | "off" | "idle";

export interface CockpitBotStatus {
  power: CockpitBotPower;
  label: string;
  detail?: string;
}

/** One-line detail for symmetrical card badges (avoids layout jump). */
export function shortBotStatusDetail(detail: string | undefined, maxLen = 36): string | undefined {
  if (!detail) return undefined;
  const trimmed = detail.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

interface CryptoAutoStatus {
  simEnabled?: boolean;
  directionBias?: string;
  reason?: string;
}

/** Pattern-bot macro gate (Crypto Bot card). */
export function cryptoBotStatus(
  settings: Pick<ZoneBotSettings, "manualOverride"> | null,
  macro: CryptoAutoStatus | null,
): CockpitBotStatus {
  if (settings?.manualOverride === "OFF") {
    return { power: "off", label: "Bot OFF", detail: "Manual override" };
  }
  if (macro?.simEnabled) {
    return {
      power: "on",
      label: "Bot ON",
      detail: macro.directionBias ?? undefined,
    };
  }
  const detail =
    macro?.reason?.replace(/^OFF —\s*/, "") ?? "Outside zones";
  return { power: "idle", label: "Bot OFF", detail };
}

/** Zone bot (BTC / ETH / SOL cards). */
export function zoneBotStatus(
  settings: Pick<ZoneBotSettings, "manualOverride"> | null,
  state: Pick<ZoneBotState, "direction" | "reason"> | null,
): CockpitBotStatus {
  if (settings?.manualOverride === "OFF") {
    return { power: "off", label: "Bot OFF", detail: "Manual override" };
  }
  const reason = state?.reason ?? "";
  if (reason.startsWith("OFF")) {
    return { power: "off", label: "Bot OFF", detail: reason.replace(/^OFF —\s*/, "") };
  }
  if (state?.direction === "BULL" || state?.direction === "BEAR") {
    return {
      power: "on",
      label: "Bot ON",
      detail: state.direction,
    };
  }
  return { power: "idle", label: "Bot IDLE", detail: reason || "Waiting for zone" };
}
