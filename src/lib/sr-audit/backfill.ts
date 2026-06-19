import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getIndexCandles, getStockCandles } from "@/lib/dhan-candles";
import { snapshotEventCandles } from "@/lib/sr-audit/candle-snapshot";
import {
  SR_SCORE_CANDLE_INTERVAL,
  SR_SUCCESS_MIN_MOVE_PCT,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import { analyzeCandlesForEvent } from "@/lib/sr-audit/score-logic";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { SR_ZONE_EVENT_CANDLES_COLLECTION } from "@/lib/sr-audit/constants";
import { matchesDirectionalSetup } from "@/lib/zones/zone-status";

export interface SrBackfillSummary {
  scanned: number;
  enriched: number;
  snapshotted: number;
  /** No candles in range — move predates Dhan's ~30-day window. */
  skippedNoCandles: number;
  winners: number;
  /** Old rows removed because they fail today's RR/tradeable gate. */
  purged: number;
  errors: string[];
}

/**
 * Re-derive the actionable/tradeable gate from a stored event's own anchors
 * (entry-time bands + max pain) — the same rule the recorder now enforces.
 */
function wasTradeable(event: SrZoneEvent): boolean {
  if (!Number.isFinite(event.entrySpot) || event.entrySpot <= 0) return false;
  return matchesDirectionalSetup(
    {
      spot: event.entrySpot,
      bullLow: event.bullZoneLow,
      bullHigh: event.bullZoneHigh,
      bearLow: event.bearZoneLow,
      bearHigh: event.bearZoneHigh,
    },
    event.maxPain,
    event.side === "support" ? "bull" : "bear",
    event.halfWidth ?? null,
  );
}

/**
 * One-time enrichment of existing SR events with the success-story fields the
 * live scorer now writes: cumulative MFE/MAE (never lowered), sticky hitPoc,
 * pocHitAt/pocHitPct, reachedTarget, and a 15-min candle snapshot for winners.
 *
 * Idempotent and best-effort per event — events whose window is gone from Dhan
 * are simply counted as skipped. Safe to run repeatedly.
 */
export async function backfillSrZoneEvents(
  db: Firestore,
  opts: { limit?: number; purge?: boolean } = {},
): Promise<SrBackfillSummary> {
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 500));
  const purge = opts.purge !== false;
  const summary: SrBackfillSummary = {
    scanned: 0,
    enriched: 0,
    snapshotted: 0,
    skippedNoCandles: 0,
    winners: 0,
    purged: 0,
    errors: [],
  };

  const snap = await db
    .collection(SR_ZONE_EVENTS_COLLECTION)
    .orderBy("eventAt", "desc")
    .limit(limit)
    .get();

  const now = new Date().toISOString();

  for (const docSnap of snap.docs) {
    summary.scanned += 1;
    const event = docSnap.data() as SrZoneEvent;
    const symbol = event.symbol;
    const scope = event.scope === "index" ? "index" : "stock";

    try {
      // Purge legacy rows that wouldn't pass today's RR/tradeable gate.
      if (purge && !wasTradeable(event)) {
        await docSnap.ref.delete();
        await db
          .collection(SR_ZONE_EVENT_CANDLES_COLLECTION)
          .doc(docSnap.id)
          .delete()
          .catch(() => {});
        summary.purged += 1;
        continue;
      }

      const candleResult =
        scope === "index"
          ? await getIndexCandles(symbol, SR_SCORE_CANDLE_INTERVAL)
          : await getStockCandles(symbol, SR_SCORE_CANDLE_INTERVAL);

      if (!candleResult.ok || !candleResult.candles.length) {
        summary.skippedNoCandles += 1;
        continue;
      }

      const analysis = analyzeCandlesForEvent(event, candleResult.candles);
      if (!analysis) {
        summary.skippedNoCandles += 1;
        continue;
      }

      const priorMfe = typeof event.maxFavorablePct === "number" ? event.maxFavorablePct : 0;
      const priorMae = typeof event.maxAdversePct === "number" ? event.maxAdversePct : 0;
      const cumMfe = Math.max(priorMfe, analysis.maxFavorablePct);
      const cumMae = Math.max(priorMae, analysis.maxAdversePct);
      const stickyHitPoc = event.hitPoc === true || analysis.hitPoc;
      const pocHitAt = event.pocHitAt ?? analysis.pocHitAt ?? null;
      const maxPainDistPct =
        event.maxPain != null && event.entrySpot > 0
          ? (Math.abs(event.maxPain - event.entrySpot) / event.entrySpot) * 100
          : null;
      const pocHitPct = event.pocHitPct ?? (stickyHitPoc ? maxPainDistPct : null);
      const reachedTarget =
        stickyHitPoc &&
        cumMfe >= SR_SUCCESS_MIN_MOVE_PCT &&
        maxPainDistPct != null &&
        maxPainDistPct >= SR_SUCCESS_MIN_MOVE_PCT;

      let candlesSnapshotAt = event.candlesSnapshotAt ?? null;
      if (reachedTarget) {
        summary.winners += 1;
        const bars = await snapshotEventCandles(db, docSnap.id, {
          ...event,
          maxFavorablePct: cumMfe,
          hitPoc: stickyHitPoc,
          pocHitAt,
          pocHitPct,
          reachedTarget,
        });
        if (bars != null) {
          candlesSnapshotAt = now;
          summary.snapshotted += 1;
        }
      }

      await docSnap.ref.set(
        {
          maxFavorablePct: cumMfe,
          maxAdversePct: cumMae,
          hitPoc: stickyHitPoc,
          pocHitAt,
          pocHitPct,
          reachedTarget,
          candlesSnapshotAt,
          updatedAt: now,
        },
        { merge: true },
      );
      summary.enriched += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push(`${symbol}: ${msg}`);
    }
  }

  return summary;
}
