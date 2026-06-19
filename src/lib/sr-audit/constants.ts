export const SR_ZONE_EVENTS_COLLECTION = "sr_zone_events";

/**
 * Per-event 15-min candle snapshot for the success-story video chart. Lives in
 * its own collection (one doc per event id) so the queryable event docs stay
 * lean — the candle blob is only read when building/replaying a story.
 */
export const SR_ZONE_EVENT_CANDLES_COLLECTION = "sr_zone_event_candles";

export const SR_AUDIT_META_DOC = "config/sr_audit_meta";

/** Ignore re-entry within this window after a resolve. */
export const SR_EVENT_DEBOUNCE_MS = 15 * 60 * 1000;

/** Max open events scored per hourly cron tick. */
export const SR_SCORE_BATCH_SIZE = 100;

/** Dhan intraday interval for outcome scoring (fine-grained, MFE/MAE accuracy). */
export const SR_SCORE_CANDLE_INTERVAL = "5";

/** Coarser interval snapshotted for the multi-day success-story video chart. */
export const SR_STORY_CANDLE_INTERVAL = "15";

/**
 * A "success story": price reached max pain after entering a cluster, with both
 * the realized favorable move AND the cluster→max-pain distance ≥ this %.
 */
export const SR_SUCCESS_MIN_MOVE_PCT = 5;
