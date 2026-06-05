import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getStockCandles } from "@/lib/dhan-candles";
import {
  SR_AUDIT_META_DOC,
  SR_EVENT_TIMEOUT_MS,
  SR_SCORE_BATCH_SIZE,
  SR_SCORE_CANDLE_INTERVAL,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import { scoreEventFromCandles } from "@/lib/sr-audit/score-logic";
import type { SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";
import type { ZoneStatus } from "@/lib/zones/zone-status";

const AGGREGATE_DOC = "config/zone_status_stocks";

export { scoreEventFromCandles } from "@/lib/sr-audit/score-logic";

function stillInZone(status: ZoneStatus | undefined, side: SrZoneSide): boolean {
  if (side === "support") return status === "IN_BULL";
  return status === "IN_BEAR";
}

export interface SrOutcomeBatchSummary {
  scanned: number;
  resolved: number;
  failed: number;
  stillOpen: number;
  errors: string[];
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

  let statusBySymbol = new Map<string, ZoneStatus>();
  try {
    const agg = await db.doc(AGGREGATE_DOC).get();
    const entries = (agg.data()?.entries ?? {}) as Record<
      string,
      { status?: ZoneStatus } | undefined
    >;
    for (const [sym, row] of Object.entries(entries)) {
      if (row?.status) statusBySymbol.set(sym.toUpperCase(), row.status);
    }
  } catch {
    statusBySymbol = new Map();
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
      const candleResult = await getStockCandles(symbol, SR_SCORE_CANDLE_INTERVAL);
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

      const currentStatus = statusBySymbol.get(symbol);
      const inZone = stillInZone(currentStatus, event.side);
      const timedOut =
        Date.now() - Date.parse(event.eventAt) >= SR_EVENT_TIMEOUT_MS;

      let score: SrScoreResult | null = scoreEventFromCandles(
        event,
        candleResult.candles,
      );

      if (!score && !inZone) {
        score = scoreEventFromCandles(event, candleResult.candles, {
          forceReason: "left_zone",
          resolvedAt: now,
        });
      }

      if (!score && timedOut) {
        score = scoreEventFromCandles(event, candleResult.candles, {
          forceReason: "timeout",
          resolvedAt: now,
        });
      }

      if (!score) {
        summary.stillOpen += 1;
        await doc.ref.set({ lastScoredAt: now, updatedAt: now }, { merge: true });
        continue;
      }

      await doc.ref.set(
        {
          state: "resolved",
          resolveReason: score.resolveReason,
          resolvedAt: score.resolvedAt,
          maxFavorablePct: score.maxFavorablePct,
          maxAdversePct: score.maxAdversePct,
          hitPoc: score.hitPoc,
          lastScoredAt: now,
          scoreError: null,
          updatedAt: now,
        },
        { merge: true },
      );
      summary.resolved += 1;
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
