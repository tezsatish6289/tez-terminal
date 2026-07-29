import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import {
  SCORE_ALERT_PREFS_COLLECTION,
  SCORE_ALERT_STATE_COLLECTION,
} from "@/lib/alerts/constants";
import {
  publicLevelsFromZoneDoc,
  zoneDocLabel,
  zoneDocPath,
} from "@/lib/alerts/levels-from-doc";
import { parseScoreAlertPreferences } from "@/lib/alerts/prefs";
import { publishScoreAlert } from "@/lib/alerts/publish-score-alert";
import type {
  ScoreAlertMinScore,
  ScoreAlertPreferences,
  ScoreAlertSide,
  ScoreAlertSymbolState,
} from "@/lib/alerts/types";
import {
  FNONINJA_FAVSLIDE_FIELD,
  favslideEntryKey,
  parseFavslideEntries,
  type FavslideEntry,
} from "@/lib/fnoninja/favslide";
import { computeLightAtlasScore } from "@/lib/levels/light-atlas-score";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

type ScoredSymbol = {
  key: string;
  scope: LevelsTvScope;
  symbol: string;
  label: string;
  score: number;
  side: ScoreAlertSide;
};

type PrefRow = {
  uid: string;
  prefs: ScoreAlertPreferences;
  favslide: FavslideEntry[];
};

export type EvaluateScoreAlertsResult = {
  users: number;
  symbolsScored: number;
  fired: number;
  skippedNoFavs: number;
  errors: string[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadEnabledPrefs(db: Firestore): Promise<PrefRow[]> {
  const snap = await db
    .collection(SCORE_ALERT_PREFS_COLLECTION)
    .where("enabled", "==", true)
    .get();

  const rows: PrefRow[] = [];
  for (const doc of snap.docs) {
    const prefs = parseScoreAlertPreferences(doc.data());
    if (!prefs.enabled) continue;
    rows.push({ uid: doc.id, prefs, favslide: [] });
  }
  if (rows.length === 0) return rows;

  // Load favslides from users/{uid}
  for (const batch of chunk(rows, 30)) {
    const refs = batch.map((r) => db.collection("users").doc(r.uid));
    const userSnaps = await db.getAll(...refs);
    for (let i = 0; i < batch.length; i++) {
      const data = userSnaps[i]?.data() ?? {};
      batch[i]!.favslide = parseFavslideEntries(data[FNONINJA_FAVSLIDE_FIELD]);
    }
  }
  return rows;
}

async function scoreSymbols(
  db: Firestore,
  entries: FavslideEntry[],
): Promise<Map<string, ScoredSymbol>> {
  const unique = new Map<string, FavslideEntry>();
  for (const e of entries) unique.set(favslideEntryKey(e), e);

  const scored = new Map<string, ScoredSymbol>();
  const list = [...unique.values()];
  for (const batch of chunk(list, 40)) {
    const refs = batch.map((e) => db.doc(zoneDocPath(e.scope, e.symbol)));
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]!;
      const key = favslideEntryKey(entry);
      const raw = snaps[i]?.exists ? (snaps[i]!.data() as Record<string, unknown>) : null;
      const levels = publicLevelsFromZoneDoc(raw);
      const result = computeLightAtlasScore(levels);
      if (!result) continue;
      scored.set(key, {
        key,
        scope: entry.scope,
        symbol: entry.symbol,
        label: zoneDocLabel(raw, entry.symbol),
        score: result.composite,
        side: result.side,
      });
    }
  }
  return scored;
}

async function loadState(
  db: Firestore,
  uid: string,
): Promise<Record<string, ScoreAlertSymbolState>> {
  const snap = await db.collection(SCORE_ALERT_STATE_COLLECTION).doc(uid).get();
  const symbols = snap.data()?.symbols;
  if (!symbols || typeof symbols !== "object") return {};
  return symbols as Record<string, ScoreAlertSymbolState>;
}

function shouldFire(
  prev: ScoreAlertSymbolState | undefined,
  score: number,
  minScore: ScoreAlertMinScore,
): boolean {
  const above = score >= minScore;
  if (!above) return false;
  // First observation only establishes baseline (no spam when enabling alerts).
  if (!prev) return false;
  return !prev.aboveThreshold;
}

export async function evaluateScoreAlerts(
  db: Firestore,
): Promise<EvaluateScoreAlertsResult> {
  const result: EvaluateScoreAlertsResult = {
    users: 0,
    symbolsScored: 0,
    fired: 0,
    skippedNoFavs: 0,
    errors: [],
  };

  const prefsRows = await loadEnabledPrefs(db);
  result.users = prefsRows.length;
  if (prefsRows.length === 0) return result;

  const allEntries: FavslideEntry[] = [];
  for (const row of prefsRows) {
    if (row.favslide.length === 0) {
      result.skippedNoFavs += 1;
      continue;
    }
    allEntries.push(...row.favslide);
  }

  const scored = await scoreSymbols(db, allEntries);
  result.symbolsScored = scored.size;

  for (const row of prefsRows) {
    if (row.favslide.length === 0) continue;
    try {
      const state = await loadState(db, row.uid);
      const nextSymbols: Record<string, ScoreAlertSymbolState> = { ...state };
      const nowIso = new Date().toISOString();
      let stateDirty = false;

      for (const entry of row.favslide) {
        const key = favslideEntryKey(entry);
        const hit = scored.get(key);
        if (!hit) continue;

        const aboveThreshold = hit.score >= row.prefs.minScore;
        const prev = state[key];

        if (shouldFire(prev, hit.score, row.prefs.minScore)) {
          await publishScoreAlert({
            uid: row.uid,
            symbol: hit.symbol,
            label: hit.label,
            scope: hit.scope,
            side: hit.side,
            score: hit.score,
            minScore: row.prefs.minScore,
          });
          result.fired += 1;
        }

        const next: ScoreAlertSymbolState = {
          score: hit.score,
          side: hit.side,
          aboveThreshold,
          updatedAt: nowIso,
        };
        const changed =
          !prev ||
          prev.score !== next.score ||
          prev.side !== next.side ||
          prev.aboveThreshold !== next.aboveThreshold;
        if (changed) {
          nextSymbols[key] = next;
          stateDirty = true;
        }
      }

      if (stateDirty) {
        await db.collection(SCORE_ALERT_STATE_COLLECTION).doc(row.uid).set(
          { symbols: nextSymbols, updatedAt: nowIso },
          { merge: true },
        );
      }
    } catch (e) {
      result.errors.push(
        `${row.uid}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
