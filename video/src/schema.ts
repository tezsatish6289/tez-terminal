import { z } from "zod";

export const candleSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});
export type Candle = z.infer<typeof candleSchema>;

/**
 * One stock slide. `variant` decides which cluster is the headline:
 *   - "put"  → biggest PUT wall below spot = support → bullish lean
 *   - "call" → biggest CALL wall above spot = resistance → bearish lean
 */
export const stockSlideSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  spot: z.number(),
  /** "IN" = spot already inside the cluster band; "NEAR" = approaching it (watch for the reaction). */
  zoneState: z.enum(["IN", "NEAR"]),
  /** Dominant put-cluster OI at support (contracts). */
  putClusterSize: z.number().nullable(),
  putClusterStrike: z.number().nullable(),
  /** Dominant call-cluster OI at resistance (contracts). */
  callClusterSize: z.number().nullable(),
  callClusterStrike: z.number().nullable(),
  bullLow: z.number().nullable(),
  bullHigh: z.number().nullable(),
  bearLow: z.number().nullable(),
  bearHigh: z.number().nullable(),
  maxPain: z.number().nullable(),
  atmIV: z.number().nullable(),
  /** Short, data-derived context tag — NEVER a market opinion. */
  contextTag: z.string().nullable(),
  candles: z.array(candleSchema),
});
export type StockSlide = z.infer<typeof stockSlideSchema>;

export const videoDataSchema = z.object({
  variant: z.enum(["put", "call"]),
  dateLabel: z.string(),
  /** Human IST timestamp of when this video's data was generated, e.g. "17 June 2026 at 04:00 PM". */
  generatedAtLabel: z.string().optional(),
  /** Background track under public/ — rotated daily (see pickMusicTrack). */
  musicTrack: z.string().optional(),
  stocks: z.array(stockSlideSchema),
});
export type VideoData = z.infer<typeof videoDataSchema>;
