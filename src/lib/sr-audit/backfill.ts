import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getIndexCandles, getStockCandles } from "@/lib/dhan-candles";
import { snapshotEventCandles } from "@/lib/sr-audit/candle-snapshot";
import {
  SR_SCORE_CANDLE_INTERVAL,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import { analyzeCandlesForEvent } from "@/lib/sr-audit/score-logic";
import { fetchDailyPvtPoints, PVT_ENTRY_WINDOW_SESSIONS } from "@/lib/levels/pvt-signal";
import { pvtSlopeSince } from "@/lib/levels/pvt";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { SR_ZONE_EVENT_CANDLES_COLLECTION } from "@/lib/sr-audit/constants";
import { deriveZoneStatus } from "@/lib/zones/zone-status";

export interface SrBackfillSummary {
  scanned: number;
  enriched: number;
  snapshotted: number;
  /** No candles in range — move predates Dhan's ~30-day window. */
  skippedNoCandles: number;
  winners: number;
  /** Old rows removed because they fail today's RR/tradeable gate. */
  purged: number;
  /** Rows given an event-anchored entry PVT confirmation (for calibration). */
  pvtSet: number;
  errors: string[];
}

/**
 * Purge gate for legacy rows. Uses ONLY criteria derivable from a stored event's
 * own anchors: spot inside the band on its side + max pain pulling toward target.
 *
 * Deliberately omits the OI-wall gate the live recorder now enforces — the
 * day-over-day OI signal at entry time was never stored on the event, so it
 * can't be re-derived. Applying it here would purge the entire history. New
 * events are OI-gated at record time; old events are kept on geometry alone.
 */
function wasTradeable(event: SrZoneEvent): boolean {
  const spot = event.entrySpot;
  if (!Number.isFinite(spot) || spot <= 0) return false;
  const mp = event.maxPain;
  if (mp == null || !Number.isFinite(mp)) return false;
  const status = deriveZoneStatus({
    spot,
    bullLow: event.bullZoneLow,
    bullHigh: event.bullZoneHigh,
    bearLow: event.bearZoneLow,
    bearHigh: event.bearZoneHigh,
  });
  if (event.side === "support") return status === "IN_BULL" && mp > spot;
  return status === "IN_BEAR" && mp < spot;
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
    pvtSet: 0,
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

      // Event-anchored PVT (daily candles, ~6mo window). Set independently of the
      // intraday MFE/MAE analysis below so it lights up even for events whose
      // 30-day intraday window has aged out of Dhan. entry = frozen leading read
      // (all states); current = entry→now (open); exit = entry→resolvedAt (closed).
      const pvtPoints = await fetchDailyPvtPoints(scope, symbol);
      if (pvtPoints) {
        const entrySec = Math.floor(Date.parse(event.eventAt) / 1000);
        const pvtPatch: Record<string, number | null> = {};
        const entryPvtSlope = pvtSlopeSince(pvtPoints, entrySec, {
          maxSessions: PVT_ENTRY_WINDOW_SESSIONS,
        });
        if (entryPvtSlope != null) pvtPatch.entryPvtSlope = entryPvtSlope;
        if (event.state === "open") {
          const currentPvtSlope = pvtSlopeSince(pvtPoints, entrySec);
          if (currentPvtSlope != null) pvtPatch.currentPvtSlope = currentPvtSlope;
        } else if (event.resolvedAt) {
          const exitSec = Math.floor(Date.parse(event.resolvedAt) / 1000);
          const exitPvtSlope = pvtSlopeSince(pvtPoints, entrySec, { untilTimeSec: exitSec });
          if (exitPvtSlope != null) pvtPatch.exitPvtSlope = exitPvtSlope;
          pvtPatch.currentPvtSlope = null; // resolved rows carry no live read
        }
        if (Object.keys(pvtPatch).length > 0) {
          await docSnap.ref.set({ ...pvtPatch, updatedAt: now }, { merge: true });
          summary.pvtSet += 1;
        }
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
      const reachedTarget = stickyHitPoc;

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
