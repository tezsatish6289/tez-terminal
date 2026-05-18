/**
 * Zone Bot — per-asset settings.
 *
 * Each zone bot has its own settings document at
 * `config/zone_bot_${asset}_settings`. The shape mirrors the existing
 * BTC heatmap settings (`heatmap-zones-settings.ts`) but is keyed by
 * asset so we can add ETH / SOL / XRP without refactoring.
 *
 * Phase 1 ships only the BTC asset. Phase 2 adds the other three by
 * extending `ZONE_BOT_REGISTRY` and `DEFAULTS`; no code-shape changes.
 *
 * See `docs/zone-bots.md` for the full design.
 */
import type { Firestore } from "firebase-admin/firestore";

// ── Asset registry ───────────────────────────────────────────────────────

/** Coins currently active as zone bots. Add new coins here in Phase 2. */
export type ZoneBotAsset = "btc";

/** Iteration order for crons / UI tabs. */
export const ZONE_BOT_REGISTRY: readonly ZoneBotAsset[] = ["btc"] as const;

/** Bybit perp symbol for the asset (used by sync-prices + live execution). */
export const ZONE_BOT_PERP_SYMBOL: Record<ZoneBotAsset, string> = {
  btc: "BTCUSDT",
};

/** Human-friendly label shown in the UI ("BTC Zone", etc.). */
export const ZONE_BOT_LABEL: Record<ZoneBotAsset, string> = {
  btc: "BTC Zone",
};

/** `botSource` value stamped on trades from this bot. */
export const ZONE_BOT_SOURCE: Record<ZoneBotAsset, string> = {
  btc: "BTC_ZONE",
};

// ── Settings shape ───────────────────────────────────────────────────────

/** AUTO  = zone bot active (opens / closes trades when zones confirm/flip).
 *  OFF   = emergency kill — no new trades. Existing open trades still
 *          manage themselves via the SL/TP engine. */
export type ZoneBotOverride = "AUTO" | "OFF";

export const VALID_OVERRIDES: ZoneBotOverride[] = ["AUTO", "OFF"];

export interface ZoneBotSettings {
  /** Master AUTO/OFF gate. Same semantics as `heatmap_zones.manualOverride`. */
  manualOverride: ZoneBotOverride;

  /** ± USD around each Deribit strike to form the zone band.
   *  @deprecated As of 2026-05-19 the suggester (`options-zones.ts`)
   *  auto-derives half-width per call from ATM IV. This field is preserved
   *  for back-compat with existing Firestore docs and the legacy UI input
   *  but the value is ignored by `computeOptionsZones`. */
  zoneHalfWidthUsd: number;

  /** Minutes BTC/ETH/etc. must hold the zone floor/ceiling without making
   *  new lows/highs before a trade may open. 5–60 range. */
  zoneConfirmMinutes: number;

  /** Minimum USD distance between a candidate strike and today's (day-0)
   *  max pain. Strikes inside the band are skipped at selection time
   *  because price action there is typically erratic. 0 disables.
   *  null → suggester default (= 2 × auto-derived halfWidth). */
  maxPainMinDistanceUsd: number;

  /** When ONLY one zone (bull OR bear) is active, close matching open trades
   *  once spot reaches within this many $ of today's max pain (the TP
   *  target). Has no effect when both zones are active. */
  maxPainProximityUsd: number;
}

// ── Defaults per asset ───────────────────────────────────────────────────
//
// These are the v1 starting points discussed in docs/zone-bots.md §1.
// User can override every field per asset via the UI; defaults only apply
// when the Firestore doc is missing the field.

export const ZONE_BOT_DEFAULTS: Record<ZoneBotAsset, ZoneBotSettings> = {
  btc: {
    manualOverride:        "AUTO",
    zoneHalfWidthUsd:      500,
    zoneConfirmMinutes:    15,
    maxPainMinDistanceUsd: 1000,
    maxPainProximityUsd:   200,
  },
};

// ── Validation ranges ────────────────────────────────────────────────────

const ZONE_HALF_WIDTH_MIN_USD = 50;
const ZONE_HALF_WIDTH_MAX_USD = 3000;
const ZONE_CONFIRM_MIN = 5;
const ZONE_CONFIRM_MAX = 60;
const MAX_PAIN_PROXIMITY_MIN_USD = 50;
const MAX_PAIN_PROXIMITY_MAX_USD = 2000;
const MAX_PAIN_MIN_DISTANCE_MIN_USD = 0;
const MAX_PAIN_MIN_DISTANCE_MAX_USD = 3000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ── Firestore paths ──────────────────────────────────────────────────────

/**
 * Settings doc path per asset.
 *
 * BTC is special: the BTC tab in the existing HeatmapAutoSwitch UI drives
 * BOTH the pattern-bot macro gate AND the BTC zone bot, so the BTC zone
 * bot reads from the pattern-bot's `config/heatmap_zones` doc rather
 * than a parallel `config/zone_bot_btc_settings` doc. HeatmapZones is a
 * superset of ZoneBotSettings — all the fields ZoneBotSettings cares
 * about (manualOverride / zoneHalfWidthUsd / zoneConfirmMinutes /
 * maxPainMinDistanceUsd / maxPainProximityUsd) live there with the same
 * names and value ranges, so `parseZoneBotSettings` just works.
 *
 * Future assets (ETH/SOL/XRP) get their own per-asset docs since there's
 * no existing pattern-bot heatmap UI for them.
 */
export function zoneBotSettingsDoc(asset: ZoneBotAsset): string {
  if (asset === "btc") return "config/heatmap_zones";
  return `config/zone_bot_${asset}_settings`;
}

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a settings document, applying per-asset defaults for any missing or
 * out-of-range fields. Never throws — bad input falls back to defaults.
 */
export function parseZoneBotSettings(
  asset: ZoneBotAsset,
  data: Record<string, unknown> | null | undefined,
): ZoneBotSettings {
  const defaults = ZONE_BOT_DEFAULTS[asset];
  const d = data ?? {};

  const override =
    typeof d.manualOverride === "string" &&
    VALID_OVERRIDES.includes(d.manualOverride as ZoneBotOverride)
      ? (d.manualOverride as ZoneBotOverride)
      : defaults.manualOverride;

  const halfWidth =
    typeof d.zoneHalfWidthUsd === "number" &&
    d.zoneHalfWidthUsd >= ZONE_HALF_WIDTH_MIN_USD &&
    d.zoneHalfWidthUsd <= ZONE_HALF_WIDTH_MAX_USD
      ? d.zoneHalfWidthUsd
      : defaults.zoneHalfWidthUsd;

  const confirmMin =
    typeof d.zoneConfirmMinutes === "number" &&
    d.zoneConfirmMinutes >= ZONE_CONFIRM_MIN &&
    d.zoneConfirmMinutes <= ZONE_CONFIRM_MAX
      ? d.zoneConfirmMinutes
      : defaults.zoneConfirmMinutes;

  // maxPainMinDistanceUsd: allow 0 to explicitly disable the filter.
  const mpMinDist =
    typeof d.maxPainMinDistanceUsd === "number" &&
    d.maxPainMinDistanceUsd >= MAX_PAIN_MIN_DISTANCE_MIN_USD &&
    d.maxPainMinDistanceUsd <= MAX_PAIN_MIN_DISTANCE_MAX_USD
      ? d.maxPainMinDistanceUsd
      : defaults.maxPainMinDistanceUsd;

  const mpProx =
    typeof d.maxPainProximityUsd === "number" &&
    d.maxPainProximityUsd >= MAX_PAIN_PROXIMITY_MIN_USD &&
    d.maxPainProximityUsd <= MAX_PAIN_PROXIMITY_MAX_USD
      ? d.maxPainProximityUsd
      : defaults.maxPainProximityUsd;

  return {
    manualOverride:        override,
    zoneHalfWidthUsd:      halfWidth,
    zoneConfirmMinutes:    confirmMin,
    maxPainMinDistanceUsd: mpMinDist,
    maxPainProximityUsd:   mpProx,
  };
}

/**
 * Coerce raw API input (PUT body) to a value within the validation range
 * for the given key. Returns `null` to signal "drop this field" so the
 * existing Firestore value (or default) wins.
 */
export function coerceZoneBotSettingField<K extends keyof ZoneBotSettings>(
  key: K,
  raw: unknown,
): ZoneBotSettings[K] | null {
  switch (key) {
    case "manualOverride":
      return (typeof raw === "string" && VALID_OVERRIDES.includes(raw as ZoneBotOverride)
        ? (raw as ZoneBotOverride)
        : null) as ZoneBotSettings[K] | null;
    case "zoneHalfWidthUsd":
      return (typeof raw === "number"
        ? clamp(raw, ZONE_HALF_WIDTH_MIN_USD, ZONE_HALF_WIDTH_MAX_USD)
        : null) as ZoneBotSettings[K] | null;
    case "zoneConfirmMinutes":
      return (typeof raw === "number"
        ? clamp(raw, ZONE_CONFIRM_MIN, ZONE_CONFIRM_MAX)
        : null) as ZoneBotSettings[K] | null;
    case "maxPainMinDistanceUsd":
      return (typeof raw === "number"
        ? clamp(raw, MAX_PAIN_MIN_DISTANCE_MIN_USD, MAX_PAIN_MIN_DISTANCE_MAX_USD)
        : null) as ZoneBotSettings[K] | null;
    case "maxPainProximityUsd":
      return (typeof raw === "number"
        ? clamp(raw, MAX_PAIN_PROXIMITY_MIN_USD, MAX_PAIN_PROXIMITY_MAX_USD)
        : null) as ZoneBotSettings[K] | null;
    default:
      return null;
  }
}

// ── Loaders (Firestore Admin) ────────────────────────────────────────────

/** Load one asset's settings; falls back to defaults if the doc is missing. */
export async function loadZoneBotSettings(
  db: Firestore,
  asset: ZoneBotAsset,
): Promise<ZoneBotSettings> {
  try {
    const snap = await db.doc(zoneBotSettingsDoc(asset)).get();
    return parseZoneBotSettings(asset, snap.exists ? (snap.data() ?? {}) : {});
  } catch {
    return parseZoneBotSettings(asset, {});
  }
}

/** Load settings for every registered zone bot in one go. Used by the cron. */
export async function loadAllZoneBotSettings(
  db: Firestore,
): Promise<Record<ZoneBotAsset, ZoneBotSettings>> {
  const entries = await Promise.all(
    ZONE_BOT_REGISTRY.map(async (asset) => [asset, await loadZoneBotSettings(db, asset)] as const),
  );
  return Object.fromEntries(entries) as Record<ZoneBotAsset, ZoneBotSettings>;
}
