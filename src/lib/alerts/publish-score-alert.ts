import "server-only";

import { getAdminDatabase, getAdminFirestore } from "@/firebase/admin";
import {
  LIVE_SCORE_ALERTS_RTDB_PATH,
  SCORE_ALERT_EVENTS_COLLECTION,
} from "@/lib/alerts/constants";
import type { LiveScoreAlert, ScoreAlertEvent, ScoreAlertMinScore, ScoreAlertSide } from "@/lib/alerts/types";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { atlasProbabilityPct } from "@/lib/levels/atlas-score-calibration";

export interface PublishScoreAlertInput {
  uid: string;
  symbol: string;
  label: string;
  scope: LevelsTvScope;
  side: ScoreAlertSide;
  score: number;
  minScore: ScoreAlertMinScore;
}

function eventId(input: PublishScoreAlertInput, atMs: number): string {
  return `${input.scope}_${input.symbol}_${input.side}_${input.minScore}_${atMs}`;
}

export async function publishScoreAlert(
  input: PublishScoreAlertInput,
): Promise<ScoreAlertEvent> {
  const atMs = Date.now();
  const at = new Date(atMs).toISOString();
  const id = eventId(input, atMs);
  const probabilityPct = atlasProbabilityPct(input.score);

  const event: ScoreAlertEvent = {
    id,
    symbol: input.symbol,
    label: input.label,
    scope: input.scope,
    side: input.side,
    score: input.score,
    minScore: input.minScore,
    probabilityPct,
    at,
    readAt: null,
  };

  const live: LiveScoreAlert = {
    id,
    symbol: event.symbol,
    label: event.label,
    scope: event.scope,
    side: event.side,
    score: event.score,
    minScore: event.minScore,
    probabilityPct: event.probabilityPct,
    at,
  };

  const db = getAdminFirestore();
  await db
    .collection(SCORE_ALERT_EVENTS_COLLECTION)
    .doc(input.uid)
    .collection("items")
    .doc(id)
    .set(event);

  await getAdminDatabase()
    .ref(`${LIVE_SCORE_ALERTS_RTDB_PATH}/${input.uid}/${id}`)
    .set(live);

  return event;
}
