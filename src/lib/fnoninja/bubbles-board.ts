import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-options-zones";
import { indexDocId } from "@/lib/index-zones-store";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { loadMmi } from "@/lib/fnoninja/load-mmi";
import type { MmiSnapshot } from "@/lib/fnoninja/mmi";
import { loadFnoUniverse } from "@/lib/nse/fno-universe-runtime";
import { storedSourceToPublic } from "@/lib/levels/levels-source";
import {
  countBubbleMapFilters,
  type BubbleMapFilter,
} from "@/lib/zones/bubble-map-filter";
import type { BubbleTone } from "@/lib/zones/bubble-tone";
import { levelsFromStockRow } from "@/lib/zones/levels-actionable-list";
import { resolveSymbolDisplayTone } from "@/lib/zones/symbol-display-tone";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import type { ZoneStatus } from "@/lib/zones/zone-status";

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";
const SAMPLE_LIMIT = 5;

/** Tones we summarize for the morning bubbles Buffer post. */
export const BUBBLES_BOARD_TONE_KEYS = [
  "IN_BULL",
  "NEAR_BULL",
  "IN_BEAR",
  "NEAR_BEAR",
] as const;

export type BubblesBoardToneKey = (typeof BUBBLES_BOARD_TONE_KEYS)[number];

export type BubblesBoardSymbol = {
  symbol: string;
  label: string;
  scope: "index" | "stock";
  tone: BubblesBoardToneKey;
  spot: number | null;
};

export type BubblesBoardSnapshot = {
  counts: Record<BubbleMapFilter, number>;
  samples: Record<BubblesBoardToneKey, BubblesBoardSymbol[]>;
  mmi: MmiSnapshot | null;
  scannedStocks: number;
  updatedAt: string | null;
};

interface StockAggregateEntry {
  symbol: string;
  label?: string;
  status?: ZoneStatus;
  spot?: number | null;
  maxPain?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
  halfWidth?: number | null;
  atmIV?: number | null;
  volRegimeFlag?: string | null;
  volRegimeReason?: string | null;
  daysToEarnings?: number | null;
  computedAt?: string;
  levelsSource?: string | null;
  oi?: OiWallMomentum | null;
}

const VOL_REGIME_FLAGS: readonly VolRegimeFlag[] = ["CALM", "ELEVATED", "EARNINGS", "UNKNOWN"];

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function volRegimeFlag(raw: unknown): VolRegimeFlag | null {
  return typeof raw === "string" && (VOL_REGIME_FLAGS as readonly string[]).includes(raw)
    ? (raw as VolRegimeFlag)
    : null;
}

function oiSignal(raw: unknown): OiWallMomentum | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.asOf !== "string" || typeof o.dominancePct !== "number") return null;
  return o as unknown as OiWallMomentum;
}

function isToneKey(tone: BubbleTone): tone is BubblesBoardToneKey {
  return (BUBBLES_BOARD_TONE_KEYS as readonly string[]).includes(tone);
}

function emptySamples(): Record<BubblesBoardToneKey, BubblesBoardSymbol[]> {
  return {
    IN_BULL: [],
    NEAR_BULL: [],
    IN_BEAR: [],
    NEAR_BEAR: [],
  };
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Latest bubbles map summary for Buffer captions + OG card. */
export async function loadBubblesBoard(): Promise<BubblesBoardSnapshot> {
  const db = getAdminFirestore();
  const [indexDocs, stockAgg, fnoUniverse, mmi] = await Promise.all([
    Promise.all(INDEX_KEYS.map((k) => readDoc(indexDocId(k)))),
    readDoc(STOCK_AGGREGATE_DOC),
    loadFnoUniverse(db),
    loadMmi(),
  ]);

  const items: { symbol: string; label: string; scope: "index" | "stock"; tone: BubbleTone; spot: number | null }[] =
    [];
  let updatedAt: string | null = null;
  let scannedStocks = 0;

  for (let i = 0; i < INDEX_KEYS.length; i++) {
    const k = INDEX_KEYS[i]!;
    const raw = indexDocs[i];
    const data = levelsFromStockRow({
      spot: num(raw?.deribitIndexPrice) ?? num(raw?.btcPrice),
      maxPain: num(raw?.maxPain),
      bullZoneLow: num(raw?.bullZoneLow),
      bullZoneHigh: num(raw?.bullZoneHigh),
      bearZoneLow: num(raw?.bearZoneLow),
      bearZoneHigh: num(raw?.bearZoneHigh),
      halfWidth: num(raw?.halfWidthUsd),
      computedAt: typeof raw?.computedAt === "string" ? raw.computedAt : null,
      levelsSource: storedSourceToPublic(
        typeof raw?.source === "string" ? raw.source : null,
      ),
      oi: oiSignal(raw?.oi),
    });
    if (data?.computedAt && (!updatedAt || data.computedAt > updatedAt)) {
      updatedAt = data.computedAt;
    }
    const tone = resolveSymbolDisplayTone(data, { scanned: Boolean(data) });
    items.push({
      symbol: k,
      label: INDEX_SPECS[k].label,
      scope: "index",
      tone,
      spot: data?.spot ?? null,
    });
  }

  const stockEntries = (stockAgg?.entries ?? {}) as Record<string, StockAggregateEntry>;
  const universe = fnoUniverse.length ? fnoUniverse : Object.keys(stockEntries).sort();

  for (const sym of universe) {
    const e = stockEntries[sym];
    const scanned = Boolean(e);
    if (scanned) scannedStocks += 1;
    const data = e
      ? levelsFromStockRow({
          spot: num(e.spot),
          maxPain: num(e.maxPain),
          bullZoneLow: num(e.bullZoneLow),
          bullZoneHigh: num(e.bullZoneHigh),
          bearZoneLow: num(e.bearZoneLow),
          bearZoneHigh: num(e.bearZoneHigh),
          halfWidth: num(e.halfWidth),
          computedAt: typeof e.computedAt === "string" ? e.computedAt : null,
          levelsSource: storedSourceToPublic(
            typeof e.levelsSource === "string" ? e.levelsSource : null,
          ),
          atmIV: num(e.atmIV),
          volRegime: volRegimeFlag(e.volRegimeFlag),
          volRegimeReason: typeof e.volRegimeReason === "string" ? e.volRegimeReason : null,
          daysToEarnings: num(e.daysToEarnings),
          oi: oiSignal(e.oi),
        })
      : null;
    if (data?.computedAt && (!updatedAt || data.computedAt > updatedAt)) {
      updatedAt = data.computedAt;
    }
    const tone = resolveSymbolDisplayTone(data, { scanned });
    items.push({
      symbol: sym,
      label: e?.label ?? sym,
      scope: "stock",
      tone,
      spot: data?.spot ?? num(e?.spot),
    });
  }

  const counts = countBubbleMapFilters(items);
  const samples = emptySamples();

  // Prefer stocks for caption/OG samples; fill with indices if a bucket is thin.
  const byTone = (tone: BubblesBoardToneKey, preferStock: boolean) =>
    items.filter(
      (it) =>
        it.tone === tone &&
        isToneKey(it.tone) &&
        (preferStock ? it.scope === "stock" : it.scope === "index"),
    );

  for (const tone of BUBBLES_BOARD_TONE_KEYS) {
    const stocks = byTone(tone, true);
    const indices = byTone(tone, false);
    const picked = [...stocks, ...indices].slice(0, SAMPLE_LIMIT);
    samples[tone] = picked.map((it) => ({
      symbol: it.symbol,
      label: it.label,
      scope: it.scope,
      tone,
      spot: it.spot,
    }));
  }

  return { counts, samples, mmi, scannedStocks, updatedAt };
}

export function fnoLevelsAbsoluteUrl(): string {
  return `${FNONINJA_SITE_URL}/levels`;
}

/** True when the map has enough signal for a morning Buffer post. */
export function bubblesBoardHasSignal(board: BubblesBoardSnapshot): boolean {
  if (board.mmi != null) return true;
  return BUBBLES_BOARD_TONE_KEYS.some((k) => board.counts[k] > 0);
}
