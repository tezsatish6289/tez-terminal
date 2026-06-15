/**
 * Unified heatmap card status — one hierarchy for cockpit bot cards.
 *
 * Buckets (shown in order of precedence):
 *   blocked — won't open new trades today (regime, manual, data, engine off)
 *   waiting — AUTO on, may trade once price/time/confirmation align
 *   ready   — active bias, confirming complete, or managing a trade
 */
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { ZONE_BOT_REGISTRY, type ZoneBotAsset } from "@/lib/zone-bot-config";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";

export type CockpitStatusBucket = "blocked" | "waiting" | "ready";

export interface CockpitCardStatus {
  bucket: CockpitStatusBucket;
  bucketLabel: string;
  headline: string;
  detail?: string;
  /** Badge dot styling */
  power: "on" | "off" | "idle";
}

const BUCKET_LABEL: Record<CockpitStatusBucket, string> = {
  blocked: "Won't trade today",
  waiting: "Waiting to trade",
  ready: "Ready to trade",
};

export interface DeriveCockpitCardStatusInput {
  botId: CockpitBotId;
  suggested: SuggestedZonesSnapshot | null;
  manualOverride?: string | null;
  /** Zone bot state.reason or heatmap_auto_status.reason */
  engineReason?: string | null;
  engineDirection?: ZoneBotDirection | null;
  /** Crypto Bot macro gate */
  simEnabled?: boolean | null;
  /** sync-zone-bots / sync-simulator has ticked recently */
  botEngineLive?: boolean;
  liveCount?: number;
}

function blocked(headline: string, detail?: string): CockpitCardStatus {
  return {
    bucket: "blocked",
    bucketLabel: BUCKET_LABEL.blocked,
    headline,
    detail,
    power: "off",
  };
}

function waiting(headline: string, detail?: string): CockpitCardStatus {
  return {
    bucket: "waiting",
    bucketLabel: BUCKET_LABEL.waiting,
    headline,
    detail,
    power: "idle",
  };
}

function ready(headline: string, detail?: string): CockpitCardStatus {
  return {
    bucket: "ready",
    bucketLabel: BUCKET_LABEL.ready,
    headline,
    detail,
    power: "on",
  };
}

function shortDetail(text: string | undefined, maxLen = 48): string | undefined {
  if (!text) return undefined;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Classify a cron-written reason string into bucket + display headline. */
function fromEngineReason(reason: string): CockpitCardStatus | null {
  const r = reason.trim();
  if (!r) return null;

  if (r.startsWith("OFF —")) {
    const body = r.replace(/^OFF —\s*/, "");
    if (/manual override/i.test(body)) return blocked("Manual OFF");
    if (/panic|signal conflict|entries suppressed/i.test(body)) {
      return blocked(body.charAt(0).toUpperCase() + body.slice(1));
    }
    if (/stale|no zones|no Deribit|no heatmap|price unavailable|price feed|no spot/i.test(body)) {
      return blocked(body.charAt(0).toUpperCase() + body.slice(1));
    }
    if (/between zones/i.test(body)) return waiting("Price between zones", body);
    if (/confirming/i.test(body)) return waiting("Zone confirming", body);
    if (/not actionable/i.test(body)) return waiting("Zone not actionable yet", body);
    if (/POC RR/i.test(body)) return waiting("POC RR too low", body);
    return waiting(body.charAt(0).toUpperCase() + body.slice(1));
  }

  if (/^BULL ACTIVE|^BEAR ACTIVE|^BULL CONFIRMING|^BEAR CONFIRMING/i.test(r)) {
    if (/CONFIRMING/i.test(r)) return waiting("Zone confirming", shortDetail(r));
    return ready(r.split("—")[0]?.trim() ?? "Active", shortDetail(r));
  }

  if (/^IDLE —/i.test(r)) {
    const body = r.replace(/^IDLE —\s*/, "");
    if (/between zones/i.test(body)) return waiting("Price between zones", body);
    return waiting("Idle", body);
  }

  if (/Signal conflict|entries suppressed/i.test(r)) {
    return blocked("Signal conflict", shortDetail(r));
  }

  if (/Panic regime/i.test(r)) return blocked("Panic regime", shortDetail(r));

  if (/confirming/i.test(r)) return waiting("Zone confirming", shortDetail(r));

  if (/POC RR/i.test(r)) return waiting("POC RR too low", shortDetail(r));

  if (/ACTIVE|opening trade|FLIP/i.test(r)) {
    return ready("In zone", shortDetail(r));
  }

  if (/zone present but not actionable/i.test(r)) {
    return waiting("Zone not actionable yet", shortDetail(r));
  }

  return null;
}

function fromSuggester(s: SuggestedZonesSnapshot): CockpitCardStatus | null {
  if (s.inPanicRegime) {
    return blocked(
      "Panic regime",
      shortDetail(s.notActionableReason ?? "High IV — entries suppressed"),
    );
  }
  if (s.signalConflict) {
    return blocked(
      "Signal conflict",
      "Day-0 and day-1 max pain on opposite sides of spot",
    );
  }
  if (s.notActionableReason?.startsWith("No un-expired")) {
    return blocked("No option data", shortDetail(s.notActionableReason));
  }
  if (s.notActionableReason?.startsWith("No big cluster")) {
    return blocked("No cluster in reach", shortDetail(s.notActionableReason));
  }
  if (s.bullActionable && s.bearActionable) {
    return ready("Bull & bear actionable");
  }
  if (s.bullActionable) return ready("Bull zone actionable");
  if (s.bearActionable) return ready("Bear zone actionable");

  if (s.notActionableReason) {
    if (/Pin chop/i.test(s.notActionableReason)) {
      return blocked("Pin chop", shortDetail(s.notActionableReason));
    }
    if (/Balanced put\/call/i.test(s.notActionableReason)) {
      return blocked("Balanced clusters", shortDetail(s.notActionableReason));
    }
    if (/TP room/i.test(s.notActionableReason)) {
      return waiting("TP room too tight", shortDetail(s.notActionableReason));
    }
    return waiting("Setup incomplete", shortDetail(s.notActionableReason));
  }

  return null;
}

export function deriveCockpitCardStatus(
  input: DeriveCockpitCardStatusInput,
): CockpitCardStatus {
  const {
    botId,
    suggested,
    manualOverride,
    engineReason,
    engineDirection,
    simEnabled,
    botEngineLive = true,
    liveCount = 0,
  } = input;

  if (manualOverride === "OFF") {
    return blocked("Manual OFF", "Turn AUTO on in Config to allow entries");
  }

  if (!suggested) {
    return waiting("No zone data", "Tap Refresh all to load Deribit zones");
  }

  if (botId !== "crypto" && !botEngineLive) {
    const asset = botId as ZoneBotAsset;
    if (!ZONE_BOT_REGISTRY.includes(asset)) {
      return blocked(
        "Engine not live",
        `${botId.toUpperCase()} zone sim not enabled — zones refresh only`,
      );
    }
    return waiting(
      "Engine warming up",
      "Waiting for first sync-zone-bots tick (~1 min)",
    );
  }

  if (liveCount > 0) {
    const side =
      engineDirection === "BEAR"
        ? "Bear"
        : engineDirection === "BULL"
          ? "Bull"
          : "Open";
    return ready(`Managing ${side} trade`, `${liveCount} open`);
  }

  if (engineDirection === "BULL" || engineDirection === "BEAR") {
    return ready(`${engineDirection} active`, shortDetail(engineReason ?? undefined));
  }

  if (engineReason) {
    const fromEngine = fromEngineReason(engineReason);
    if (fromEngine) return fromEngine;
  }

  if (botId === "crypto") {
    if (simEnabled === true) {
      return ready(
        "Macro ON",
        shortDetail(engineReason ?? "Pattern bot may fire in zone"),
      );
    }
    if (simEnabled === false && engineReason) {
      const fromMacro = fromEngineReason(engineReason);
      if (fromMacro) return fromMacro;
      return waiting("Macro OFF", shortDetail(engineReason));
    }
  }

  const fromZones = fromSuggester(suggested);
  if (fromZones) return fromZones;

  return waiting("Idle", "Price not in an entry zone");
}
