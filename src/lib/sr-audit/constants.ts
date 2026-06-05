export const SR_ZONE_EVENTS_COLLECTION = "sr_zone_events";

export const SR_AUDIT_META_DOC = "config/sr_audit_meta";

/** Ignore re-entry within this window after a resolve. */
export const SR_EVENT_DEBOUNCE_MS = 15 * 60 * 1000;

/** Auto-close open events after this (no invalidation / still in zone). */
export const SR_EVENT_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** Max open events scored per hourly cron tick. */
export const SR_SCORE_BATCH_SIZE = 50;

/** Dhan intraday interval for outcome scoring. */
export const SR_SCORE_CANDLE_INTERVAL = "5";
