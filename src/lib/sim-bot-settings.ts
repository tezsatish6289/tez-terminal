/**
 * Per-bot simulator settings — one Firestore doc per cockpit card.
 * Users configure each bot from that card's Config sheet.
 */
import type { Firestore } from "firebase-admin/firestore";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  parseZoneBotSettings,
  zoneBotSettingsDoc,
  type ZoneBotAsset,
  type ZoneBotSettings,
} from "@/lib/zone-bot-config";
import { SIM_CONFIG } from "@/lib/simulator";

export type SimBotOverride = "AUTO" | "OFF";

/** Trading + gates stored per bot (crypto + each zone bot). */
export interface SimBotSettings {
  manualOverride: SimBotOverride;
  /** Max concurrent OPEN sim trades for this bot only. */
  maxOpenTrades: number;
  /** Fraction of capital risked per trade (0.01 = 1%). */
  riskPerTradePct: number;

  // ── Crypto / pattern bot only ─────────────────────────────────────────
  minScore?: number;
  maxSlDistancePct?: number;
  maxTp1ConsumedPct?: number;
  /** Optional higher risk when streak active (crypto). */
  riskPerTradeStreakPct?: number;
  streakWinsToScale?: number;
  maxOpenTradesStreakCap?: number;

  // ── Zone bots only ────────────────────────────────────────────────────
  zoneConfirmMinutes?: number;
  maxPainMinDistanceUsd?: number;
  maxPainProximityUsd?: number;
  /** Legacy field — ignored by suggester, kept for doc compat. */
  zoneHalfWidthUsd?: number;
}

const MAX_OPEN_MIN = 1;
const MAX_OPEN_MAX = 10;
const RISK_MIN = 0.005;
const RISK_MAX = 0.05;

export const SIM_BOT_SETTINGS_DOC: Record<CockpitBotId, string> = {
  crypto: "config/sim_bot_crypto_settings",
  btc: "config/sim_bot_btc_settings",
  eth: "config/sim_bot_eth_settings",
  sol: "config/sim_bot_sol_settings",
};

const DEFAULTS: Record<CockpitBotId, SimBotSettings> = {
  crypto: {
    manualOverride: "AUTO",
    maxOpenTrades: SIM_CONFIG.MAX_OPEN_TRADES_BASE,
    riskPerTradePct: SIM_CONFIG.RISK_PER_TRADE_BASE,
    minScore: SIM_CONFIG.INCUBATED_MIN_SCORE,
    maxSlDistancePct: SIM_CONFIG.INCUBATED_MAX_SL_DISTANCE_PCT,
    maxTp1ConsumedPct: SIM_CONFIG.INCUBATED_TP1_CONSUMED_MAX,
    riskPerTradeStreakPct: SIM_CONFIG.RISK_PER_TRADE_STREAK,
    streakWinsToScale: SIM_CONFIG.STREAK_WINS_TO_SCALE,
    maxOpenTradesStreakCap: SIM_CONFIG.MAX_OPEN_TRADES_CAP,
    // BTC macro gate (stored in heatmap_zones; synced on save)
    zoneConfirmMinutes: 15,
    maxPainMinDistanceUsd: 1000,
    maxPainProximityUsd: 200,
    zoneHalfWidthUsd: 500,
  },
  btc: {
    manualOverride: "AUTO",
    maxOpenTrades: 1,
    riskPerTradePct: SIM_CONFIG.RISK_PER_TRADE_BASE,
    zoneConfirmMinutes: 15,
    maxPainMinDistanceUsd: 1000,
    maxPainProximityUsd: 200,
    zoneHalfWidthUsd: 500,
  },
  eth: {
    manualOverride: "AUTO",
    maxOpenTrades: 1,
    riskPerTradePct: SIM_CONFIG.RISK_PER_TRADE_BASE,
    zoneConfirmMinutes: 15,
    maxPainMinDistanceUsd: 50,
    maxPainProximityUsd: 10,
    zoneHalfWidthUsd: 25,
  },
  sol: {
    manualOverride: "AUTO",
    maxOpenTrades: 1,
    riskPerTradePct: SIM_CONFIG.RISK_PER_TRADE_BASE,
    zoneConfirmMinutes: 15,
    maxPainMinDistanceUsd: 3,
    maxPainProximityUsd: 0.5,
    zoneHalfWidthUsd: 1.5,
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function readOverride(raw: unknown): SimBotOverride {
  return raw === "OFF" ? "OFF" : "AUTO";
}

export function parseSimBotSettings(
  botId: CockpitBotId,
  data: Record<string, unknown> | null | undefined,
): SimBotSettings {
  const d = DEFAULTS[botId];
  const raw = data ?? {};
  const maxOpen =
    typeof raw.maxOpenTrades === "number" && Number.isFinite(raw.maxOpenTrades)
      ? clamp(Math.round(raw.maxOpenTrades), MAX_OPEN_MIN, MAX_OPEN_MAX)
      : d.maxOpenTrades;
  const risk =
    typeof raw.riskPerTradePct === "number" && Number.isFinite(raw.riskPerTradePct)
      ? clamp(raw.riskPerTradePct, RISK_MIN, RISK_MAX)
      : d.riskPerTradePct;

  const base: SimBotSettings = {
    manualOverride: readOverride(raw.manualOverride ?? d.manualOverride),
    maxOpenTrades: maxOpen,
    riskPerTradePct: risk,
  };

  if (botId === "crypto") {
    const zone = parseZoneBotSettings("btc", raw);
    return {
      ...base,
      minScore:
        typeof raw.minScore === "number"
          ? clamp(Math.round(raw.minScore), 40, 90)
          : d.minScore!,
      maxSlDistancePct:
        typeof raw.maxSlDistancePct === "number"
          ? clamp(raw.maxSlDistancePct, 0.02, 0.2)
          : d.maxSlDistancePct!,
      maxTp1ConsumedPct:
        typeof raw.maxTp1ConsumedPct === "number"
          ? clamp(raw.maxTp1ConsumedPct, 0.1, 0.9)
          : d.maxTp1ConsumedPct!,
      riskPerTradeStreakPct:
        typeof raw.riskPerTradeStreakPct === "number"
          ? clamp(raw.riskPerTradeStreakPct, RISK_MIN, RISK_MAX)
          : d.riskPerTradeStreakPct!,
      streakWinsToScale:
        typeof raw.streakWinsToScale === "number"
          ? clamp(Math.round(raw.streakWinsToScale), 1, 5)
          : d.streakWinsToScale!,
      maxOpenTradesStreakCap:
        typeof raw.maxOpenTradesStreakCap === "number"
          ? clamp(Math.round(raw.maxOpenTradesStreakCap), maxOpen, MAX_OPEN_MAX)
          : d.maxOpenTradesStreakCap!,
      zoneConfirmMinutes: zone.zoneConfirmMinutes,
      maxPainMinDistanceUsd: zone.maxPainMinDistanceUsd,
      maxPainProximityUsd: zone.maxPainProximityUsd,
      zoneHalfWidthUsd: zone.zoneHalfWidthUsd,
    };
  }

  const zone = parseZoneBotSettings(botId as ZoneBotAsset, raw);
  return {
    ...base,
    maxOpenTrades: maxOpen,
    riskPerTradePct: risk,
    zoneConfirmMinutes: zone.zoneConfirmMinutes,
    maxPainMinDistanceUsd: zone.maxPainMinDistanceUsd,
    maxPainProximityUsd: zone.maxPainProximityUsd,
    zoneHalfWidthUsd: zone.zoneHalfWidthUsd,
  };
}

/** Map unified settings → zone engine shape. */
export function toZoneBotSettings(s: SimBotSettings): ZoneBotSettings {
  return {
    manualOverride: s.manualOverride,
    zoneHalfWidthUsd: s.zoneHalfWidthUsd ?? 500,
    zoneConfirmMinutes: s.zoneConfirmMinutes ?? 15,
    maxPainMinDistanceUsd: s.maxPainMinDistanceUsd ?? 1000,
    maxPainProximityUsd: s.maxPainProximityUsd ?? 200,
  };
}

/** Load from new doc; for BTC/ETH/SOL fall back to legacy zone docs once. */
export async function loadSimBotSettings(
  db: Firestore,
  botId: CockpitBotId,
): Promise<SimBotSettings> {
  const primary = SIM_BOT_SETTINGS_DOC[botId];
  const snap = await db.doc(primary).get();
  if (snap.exists) {
    let data = snap.data() as Record<string, unknown>;
    if (botId === "crypto") {
      const hz = await db.doc("config/heatmap_zones").get();
      if (hz.exists) {
        const h = hz.data() ?? {};
        data = {
          ...data,
          manualOverride: h.manualOverride ?? data.manualOverride,
          zoneConfirmMinutes: h.zoneConfirmMinutes ?? data.zoneConfirmMinutes,
          maxPainMinDistanceUsd: h.maxPainMinDistanceUsd ?? data.maxPainMinDistanceUsd,
          maxPainProximityUsd: h.maxPainProximityUsd ?? data.maxPainProximityUsd,
          zoneHalfWidthUsd: h.zoneHalfWidthUsd ?? data.zoneHalfWidthUsd,
        };
      }
    }
    return parseSimBotSettings(botId, data);
  }

  // Legacy migration read (no write — user save creates new doc).
  if (botId === "crypto") {
    const hz = await db.doc("config/heatmap_zones").get();
    if (hz.exists) {
      const h = hz.data() ?? {};
      return parseSimBotSettings("crypto", {
        manualOverride: h.manualOverride,
        zoneConfirmMinutes: h.zoneConfirmMinutes,
        maxPainMinDistanceUsd: h.maxPainMinDistanceUsd,
        maxPainProximityUsd: h.maxPainProximityUsd,
        zoneHalfWidthUsd: h.zoneHalfWidthUsd,
      });
    }
  }
  if (botId === "btc" || botId === "eth" || botId === "sol") {
    const legacyPath = zoneBotSettingsDoc(botId as ZoneBotAsset);
    const leg = await db.doc(legacyPath).get();
    if (leg.exists) {
      return parseSimBotSettings(botId, leg.data() as Record<string, unknown>);
    }
  }

  return parseSimBotSettings(botId, null);
}

export function simBotSettingsToPartialUpdate(
  botId: CockpitBotId,
  body: Partial<SimBotSettings>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  const keys: (keyof SimBotSettings)[] = [
    "manualOverride",
    "maxOpenTrades",
    "riskPerTradePct",
    "minScore",
    "maxSlDistancePct",
    "maxTp1ConsumedPct",
    "riskPerTradeStreakPct",
    "streakWinsToScale",
    "maxOpenTradesStreakCap",
    "zoneConfirmMinutes",
    "maxPainMinDistanceUsd",
    "maxPainProximityUsd",
    "zoneHalfWidthUsd",
  ];
  const parsed = parseSimBotSettings(botId, { ...DEFAULTS[botId], ...body });
  for (const k of keys) {
    if (k in body) update[k] = parsed[k];
  }
  return update;
}
