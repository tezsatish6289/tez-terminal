import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getIndexCandles, getStockCandles } from "@/lib/dhan-candles";
import { snapshotEventCandles } from "@/lib/sr-audit/candle-snapshot";
import {
  SR_AUDIT_META_DOC,
  SR_SCORE_BATCH_SIZE,
  SR_SCORE_CANDLE_INTERVAL,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import {
  closeCommentForReason,
  isZoneFlipStatus,
  srPnlPct,
} from "@/lib/sr-audit/pnl";
import {
  analyzeCandlesForEvent,
  lastCandleCloseSinceEvent,
} from "@/lib/sr-audit/score-logic";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import type { ZoneStatus } from "@/lib/zones/zone-status";

const AGGREGATE_DOC = "config/zone_status_stocks";

export { analyzeCandlesForEvent } from "@/lib/sr-audit/score-logic";

interface AggregateRow {
  status?: ZoneStatus;
  spot?: number | null;
}

export interface SrOutcomeBatchSummary {
  scanned: number;
  resolved: number;
  failed: number;
  stillOpen: number;
  errors: string[];
}

function resolveSpotPrice(
  aggregateSpot: number | null | undefined,
  candleClose: number | null,
): number | null {
  if (aggregateSpot != null && Number.isFinite(aggregateSpot) && aggregateSpot > 0) {
    return aggregateSpot;
  }
  return candleClose;
}

function finalSpotForClose(
  event: SrZoneEvent,
  reason: "invalidation" | "zone_flip",
  markSpot: number | null,
): number | null {
  if (reason === "invalidation" && event.invalidation != null) {
    return event.invalidation;
  }
  return markSpot;
}

export async function scoreOpenSrZoneEvents(
  db: Firestore,
): Promise<SrOutcomeBatchSummary> {
  const summary: SrOutcomeBatchSummary = {
    scanned: 0,
    resolved: 0,
    failed: 0,
    stillOpen: 0,
    errors: [],
  };

  const aggregateBySymbol = new Map<string, AggregateRow>();
  try {
    const agg = await db.doc(AGGREGATE_DOC).get();
    const entries = (agg.data()?.entries ?? {}) as Record<
      string,
      AggregateRow | undefined
    >;
    for (const [sym, row] of Object.entries(entries)) {
      if (row) aggregateBySymbol.set(sym.toUpperCase(), row);
    }
  } catch {
    /* best-effort */
  }

  const snap = await db
    .collection(SR_ZONE_EVENTS_COLLECTION)
    .where("state", "==", "open")
    .limit(SR_SCORE_BATCH_SIZE)
    .get();

  const now = new Date().toISOString();

  for (const doc of snap.docs) {
    summary.scanned += 1;
    const event = doc.data() as SrZoneEvent;
    const symbol = event.symbol;

    try {
      const scope = event.scope === "index" ? "index" : "stock";
      const candleResult =
        scope === "index"
          ? await getIndexCandles(symbol, SR_SCORE_CANDLE_INTERVAL)
          : await getStockCandles(symbol, SR_SCORE_CANDLE_INTERVAL);
      if (!candleResult.ok || !candleResult.candles.length) {
        summary.failed += 1;
        await doc.ref.set(
          {
            lastScoredAt: now,
            scoreError: candleResult.error ?? "no_candles",
            updatedAt: now,
          },
          { merge: true },
        );
        continue;
      }

      const analysis = analyzeCandlesForEvent(event, candleResult.candles);
      if (!analysis) {
        summary.stillOpen += 1;
        await doc.ref.set({ lastScoredAt: now, updatedAt: now }, { merge: true });
        continue;
      }

      const agg = aggregateBySymbol.get(symbol);
      const candleClose = lastCandleCloseSinceEvent(candleResult.candles, event.eventAt);
      const markSpot = resolveSpotPrice(agg?.spot, candleClose);
      const currentPnlPct =
        markSpot != null ? srPnlPct(event.side, event.entrySpot, markSpot) : null;

      // Cumulative running extremes — the candle window slides (Dhan ~30d), so
      // never lower a previously-recorded MFE/MAE; once max pain is hit it stays.
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
      // ▲% at the max-pain target (entry→max-pain distance) — the headline payoff.
      const pocHitPct =
        event.pocHitPct ?? (stickyHitPoc ? maxPainDistPct : null);
      // A win is simply reaching max pain. The entry RR gate already guarantees a
      // meaningful, tradeable cluster→max-pain target, so no extra % filter.
      const reachedTarget = stickyHitPoc;

      // Snapshot the 15-min chart window for winners so it survives Dhan's 30-day
      // window (cheap: only candidates, few per day). Refreshes while still open.
      let candlesSnapshotAt = event.candlesSnapshotAt ?? null;
      if (reachedTarget) {
        const bars = await snapshotEventCandles(db, doc.id, {
          ...event,
          maxFavorablePct: cumMfe,
          hitPoc: stickyHitPoc,
          pocHitAt,
          pocHitPct,
          reachedTarget,
        });
        if (bars != null) candlesSnapshotAt = now;
      }

      const openPatch = {
        maxFavorablePct: cumMfe,
        maxAdversePct: cumMae,
        hitPoc: stickyHitPoc,
        pocHitAt,
        pocHitPct,
        reachedTarget,
        candlesSnapshotAt,
        currentSpot: markSpot,
        currentPnlPct,
        lastScoredAt: now,
        scoreError: null,
        updatedAt: now,
      };

      if (analysis.invalidationHit) {
        const finalSpot = finalSpotForClose(event, "invalidation", markSpot);
        const finalPnlPct =
          finalSpot != null ? srPnlPct(event.side, event.entrySpot, finalSpot) : null;

        await doc.ref.set(
          {
            ...openPatch,
            state: "resolved",
            resolveReason: "invalidation",
            closeComment: closeCommentForReason("invalidation"),
            resolvedAt: analysis.invalidationHit.resolvedAt,
            finalPnlPct,
            currentSpot: null,
            currentPnlPct: null,
          },
          { merge: true },
        );
        summary.resolved += 1;
        continue;
      }

      if (isZoneFlipStatus(agg?.status, event.side)) {
        const finalSpot = finalSpotForClose(event, "zone_flip", markSpot);
        const finalPnlPct =
          finalSpot != null ? srPnlPct(event.side, event.entrySpot, finalSpot) : null;

        await doc.ref.set(
          {
            ...openPatch,
            state: "resolved",
            resolveReason: "zone_flip",
            closeComment: closeCommentForReason("zone_flip"),
            resolvedAt: now,
            finalPnlPct,
            currentSpot: null,
            currentPnlPct: null,
          },
          { merge: true },
        );
        summary.resolved += 1;
        continue;
      }

      summary.stillOpen += 1;
      await doc.ref.set(openPatch, { merge: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.failed += 1;
      summary.errors.push(`${symbol}: ${msg}`);
      await doc.ref.set(
        {
          lastScoredAt: now,
          scoreError: msg.slice(0, 300),
          updatedAt: now,
        },
        { merge: true },
      );
    }
  }

  try {
    await db.doc(SR_AUDIT_META_DOC).set(
      {
        lastOutcomeCronAt: now,
        lastOutcomeSummary: summary,
        updatedAt: now,
      },
      { merge: true },
    );
  } catch {
    /* best-effort */
  }

  return summary;
}
