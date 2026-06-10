/**
 * Server-side aggregation for the Level Cron Dashboard (admin).
 */
import type { Firestore } from "firebase-admin/firestore";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-specs";
import {
  CRON_JOBS,
  evaluateCronLevel,
  type CronHealthLevel,
  type CronHeartbeatDoc,
} from "@/lib/cron-health-shared";
import {
  FNO_UNIVERSE,
  nextStockZonesBatch,
  type StockAggregateMeta,
} from "@/lib/nse/fno-universe";
import type { StockZoneAggregateEntry } from "@/lib/equity-zones-store";
import {
  buildGeographicInZoneList,
  levelsFromStockRow,
} from "@/lib/zones/levels-actionable-list";
import type { ZoneStatus } from "@/lib/zones/zone-status";
import { istCalendarDateKey } from "@/lib/ist-display";
import { stockDocId } from "@/lib/equity-zones-store";

const AGGREGATE_DOC = "config/zone_status_stocks";
const CURSOR_DOC = "config/stock_zones_cursor";
const RUN_LOCK_DOC = "config/stock_zones_run_lock";
const NSE_STATE_DOC = "config/nse_fetch_state";

function todayIstKey(now = Date.now()): string {
  return istCalendarDateKey(now);
}

function parseSymbolsFromCronSummary(summary: string | null): string[] {
  if (!summary) return [];
  const m = summary.match(/syms=([A-Z0-9,&.-]+)/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export interface LevelsCronStockRow {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  computedAt: string | null;
  levelsSource: string | null;
  ageHours: number | null;
}

export interface LevelsCronIndexRow {
  symbol: string;
  label: string;
  computedAt: string | null;
  spot: number | null;
  ageHours: number | null;
}

export interface LevelsCronBatchError {
  symbol: string;
  error: string | null;
  computedAt: string | null;
}

export interface LevelsCronDashboardPayload {
  fetchedAt: string;
  todayIst: string;
  stockCron: {
    level: CronHealthLevel;
    staleMs: number | null;
    heartbeat: CronHeartbeatDoc;
    expectedIntervalMs: number;
  };
  indexCron: {
    level: CronHealthLevel;
    staleMs: number | null;
    heartbeat: CronHeartbeatDoc;
  };
  universe: {
    fnoTotal: number;
    inAggregate: number;
    neverScanned: number;
    neverScannedSymbols: string[];
    backlogRemaining: number;
  };
  freshness: {
    scannedTodayIst: number;
    staleOver24h: number;
    staleOver7d: number;
    inZoneCount: number;
    aggregateUpdatedAt: string | null;
  };
  scansByDayIst: { date: string; count: number }[];
  scannedToday: LevelsCronStockRow[];
  oldestStale: LevelsCronStockRow[];
  nextBatchPreview: string[];
  queueMode: "backlog" | "refresh";
  cursorIndex: number;
  nseBreaker: {
    open: boolean;
    blockedUntil: string | null;
    consecutiveBlocks: number;
    lastError: string | null;
    updatedAt: string | null;
  };
  runLock: {
    active: boolean;
    until: string | null;
    startedAt: string | null;
  };
  runtime: {
    batchSize: number;
    maxRunMs: number;
    symbolTimeoutMs: number;
    marketWindowIst: string;
    expectedScansPerHour: number;
  };
  indices: LevelsCronIndexRow[];
  recentBatchErrors: LevelsCronBatchError[];
}

async function loadHeartbeat(
  db: Firestore,
  jobId: "suggest-stock-zones" | "suggest-zones",
): Promise<{ heartbeat: CronHeartbeatDoc; level: CronHealthLevel; staleMs: number | null }> {
  const job = CRON_JOBS[jobId];
  const snap = await db.collection("cron_health").doc(jobId).get();
  const raw = snap.data() as Record<string, unknown> | undefined;
  const heartbeat: CronHeartbeatDoc = {
    jobId,
    label: job.label,
    enabled: raw?.enabled !== false,
    lastAttemptAt: toIsoString(raw?.lastAttemptAt),
    lastSuccessAt: toIsoString(raw?.lastSuccessAt),
    lastError: typeof raw?.lastError === "string" ? raw.lastError : null,
    consecutiveFailures:
      typeof raw?.consecutiveFailures === "number" ? raw.consecutiveFailures : 0,
    consecutiveDegraded:
      typeof raw?.consecutiveDegraded === "number" ? raw.consecutiveDegraded : 0,
    lastDurationMs: typeof raw?.lastDurationMs === "number" ? raw.lastDurationMs : null,
    lastSummary: typeof raw?.lastSummary === "string" ? raw.lastSummary : null,
    lastTelegramLevel:
      raw?.lastTelegramLevel === "ok" ||
      raw?.lastTelegramLevel === "warn" ||
      raw?.lastTelegramLevel === "critical" ||
      raw?.lastTelegramLevel === "unknown"
        ? raw.lastTelegramLevel
        : null,
    lastTelegramAt: toIsoString(raw?.lastTelegramAt),
  };
  const { level, staleMs } = evaluateCronLevel(job, heartbeat);
  return { heartbeat, level, staleMs };
}

export async function loadLevelsCronDashboard(
  db: Firestore,
): Promise<LevelsCronDashboardPayload> {
  const now = Date.now();
  const todayKey = todayIstKey(now);

  const [
    stockCron,
    indexCron,
    aggSnap,
    cursorSnap,
    lockSnap,
    nseSnap,
    ...indexDocs
  ] = await Promise.all([
    loadHeartbeat(db, "suggest-stock-zones"),
    loadHeartbeat(db, "suggest-zones"),
    db.doc(AGGREGATE_DOC).get(),
    db.doc(CURSOR_DOC).get(),
    db.doc(RUN_LOCK_DOC).get(),
    db.doc(NSE_STATE_DOC).get(),
    ...INDEX_KEYS.map((k) => db.doc(`config/suggested_index_zones_${k}`).get()),
  ]);

  const entries = (aggSnap.data()?.entries ?? {}) as Record<
    string,
    StockZoneAggregateEntry | undefined
  >;
  const aggregateUpdatedAt = toIsoString(aggSnap.data()?.updatedAt);

  const scanned = new Set<string>();
  const bySymbol = new Map<string, StockAggregateMeta>();
  const stockRows: LevelsCronStockRow[] = [];

  const dayCounts = new Map<string, number>();
  let scannedTodayIst = 0;
  let staleOver24h = 0;
  let staleOver7d = 0;

  for (const [sym, row] of Object.entries(entries)) {
    if (!row) continue;
    scanned.add(sym);
    const computedAt = typeof row.computedAt === "string" ? row.computedAt : null;
    bySymbol.set(sym, { computedAt });

    const ageMs = computedAt ? now - Date.parse(computedAt) : null;
    const ageHours =
      ageMs != null && Number.isFinite(ageMs) ? Math.round(ageMs / 3_600_000) : null;

    if (computedAt) {
      const dk = istCalendarDateKey(computedAt);
      if (dk) dayCounts.set(dk, (dayCounts.get(dk) ?? 0) + 1);
      if (dk === todayKey) scannedTodayIst++;
      if (ageMs != null && ageMs > 24 * 3_600_000) staleOver24h++;
      if (ageMs != null && ageMs > 7 * 24 * 3_600_000) staleOver7d++;
    }

    stockRows.push({
      symbol: row.symbol ?? sym,
      label: row.label ?? sym,
      status: row.status,
      spot: row.spot ?? null,
      computedAt,
      levelsSource: row.levelsSource ?? null,
      ageHours,
    });
  }

  const neverScannedSymbols = FNO_UNIVERSE.filter((s) => !scanned.has(s));

  const cursorIndex =
    cursorSnap.exists && typeof cursorSnap.data()?.index === "number"
      ? (cursorSnap.data()!.index as number)
      : 0;

  const batchSize = envNum("STOCK_ZONES_BATCH_SIZE", 3);
  const picked = nextStockZonesBatch(cursorIndex, batchSize, scanned, bySymbol);

  const oldestStale = [...stockRows]
    .sort((a, b) => {
      const am = a.computedAt ? Date.parse(a.computedAt) : 0;
      const bm = b.computedAt ? Date.parse(b.computedAt) : 0;
      return am - bm;
    })
    .slice(0, 12);

  const scannedToday = stockRows
    .filter((r) => r.computedAt && istCalendarDateKey(r.computedAt) === todayKey)
    .sort((a, b) => Date.parse(b.computedAt!) - Date.parse(a.computedAt!));

  const scansByDayIst = [...dayCounts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14)
    .map(([date, count]) => ({ date, count }));

  const indices: LevelsCronIndexRow[] = INDEX_KEYS.map((k, i) => {
    const data = indexDocs[i]?.data() as Record<string, unknown> | undefined;
    const computedAt = toIsoString(data?.computedAt);
    const spot =
      typeof data?.deribitIndexPrice === "number"
        ? data.deribitIndexPrice
        : typeof data?.btcPrice === "number"
          ? data.btcPrice
          : null;
    const ageMs = computedAt ? now - Date.parse(computedAt) : null;
    return {
      symbol: k,
      label: INDEX_SPECS[k].label,
      computedAt,
      spot,
      ageHours:
        ageMs != null && Number.isFinite(ageMs) ? Math.round(ageMs / 3_600_000) : null,
    };
  });

  const indexPayload = INDEX_KEYS.map((k, i) => {
    const data = indexDocs[i]?.data() as Record<string, unknown> | undefined;
    if (!data) return { symbol: k, label: INDEX_SPECS[k].label, data: null };
    return {
      symbol: k,
      label: INDEX_SPECS[k].label,
      data: levelsFromStockRow({
        symbol: k,
        label: INDEX_SPECS[k].label,
        spot:
          typeof data.deribitIndexPrice === "number"
            ? data.deribitIndexPrice
            : typeof data.btcPrice === "number"
              ? data.btcPrice
              : null,
        maxPain: typeof data.maxPain === "number" ? data.maxPain : null,
        bullZoneLow: typeof data.bullZoneLow === "number" ? data.bullZoneLow : null,
        bullZoneHigh: typeof data.bullZoneHigh === "number" ? data.bullZoneHigh : null,
        bearZoneLow: typeof data.bearZoneLow === "number" ? data.bearZoneLow : null,
        bearZoneHigh: typeof data.bearZoneHigh === "number" ? data.bearZoneHigh : null,
        halfWidth: typeof data.halfWidthUsd === "number" ? data.halfWidthUsd : null,
        computedAt: toIsoString(data.computedAt),
      }),
    };
  });

  const inZoneGeographic = buildGeographicInZoneList({
    indices: indexPayload,
    stocks: stockRows
      .map((r) => {
        const e = entries[r.symbol];
        if (!e) return null;
        const data = levelsFromStockRow({
          symbol: r.symbol,
          label: r.label,
          spot: r.spot,
          maxPain: e.maxPain,
          bullZoneLow: e.bullZoneLow,
          bullZoneHigh: e.bullZoneHigh,
          bearZoneLow: e.bearZoneLow,
          bearZoneHigh: e.bearZoneHigh,
          halfWidth: e.halfWidth,
          computedAt: r.computedAt,
          levelsSource: e.levelsSource,
        });
        if (!data) return null;
        return {
          symbol: r.symbol,
          label: r.label,
          spot: r.spot,
          maxPain: e.maxPain,
          bullZoneLow: e.bullZoneLow,
          bullZoneHigh: e.bullZoneHigh,
          bearZoneLow: e.bearZoneLow,
          bearZoneHigh: e.bearZoneHigh,
          halfWidth: e.halfWidth,
          computedAt: r.computedAt,
          levelsSource: e.levelsSource,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null),
  }).length;

  const nseRaw = nseSnap.data() as Record<string, unknown> | undefined;
  const blockedUntil = toIsoString(nseRaw?.blockedUntil);
  const nseOpen =
    blockedUntil != null &&
    Number.isFinite(Date.parse(blockedUntil)) &&
    Date.parse(blockedUntil) > now;

  const lockUntil = toIsoString(lockSnap.data()?.until);
  const lockActive =
    lockUntil != null &&
    Number.isFinite(Date.parse(lockUntil)) &&
    Date.parse(lockUntil) > now;

  const batchSizeEnv = envNum("STOCK_ZONES_BATCH_SIZE", 3);

  const batchSyms = parseSymbolsFromCronSummary(stockCron.heartbeat.lastSummary);
  const recentBatchErrors: LevelsCronBatchError[] = await Promise.all(
    batchSyms.map(async (symbol) => {
      try {
        const snap = await db.doc(stockDocId(symbol)).get();
        const d = snap.data() as Record<string, unknown> | undefined;
        return {
          symbol,
          error: typeof d?.nseFetchError === "string" ? d.nseFetchError : null,
          computedAt: toIsoString(d?.computedAt),
        };
      } catch {
        return { symbol, error: null, computedAt: null };
      }
    }),
  );

  return {
    fetchedAt: new Date(now).toISOString(),
    todayIst: todayKey,
    stockCron: {
      ...stockCron,
      expectedIntervalMs: CRON_JOBS["suggest-stock-zones"].intervalMs,
    },
    indexCron,
    universe: {
      fnoTotal: FNO_UNIVERSE.length,
      inAggregate: scanned.size,
      neverScanned: neverScannedSymbols.length,
      neverScannedSymbols: neverScannedSymbols.slice(0, 20),
      backlogRemaining: neverScannedSymbols.length,
    },
    freshness: {
      scannedTodayIst,
      staleOver24h,
      staleOver7d,
      inZoneCount: inZoneGeographic,
      aggregateUpdatedAt,
    },
    scansByDayIst,
    scannedToday,
    oldestStale,
    nextBatchPreview: picked.symbols,
    queueMode: picked.mode,
    cursorIndex,
    nseBreaker: {
      open: nseOpen,
      blockedUntil,
      consecutiveBlocks:
        typeof nseRaw?.consecutiveBlocks === "number" ? nseRaw.consecutiveBlocks : 0,
      lastError: typeof nseRaw?.lastError === "string" ? nseRaw.lastError : null,
      updatedAt: toIsoString(nseRaw?.updatedAt),
    },
    runLock: {
      active: lockActive,
      until: lockUntil,
      startedAt: toIsoString(lockSnap.data()?.startedAt),
    },
    runtime: {
      batchSize: batchSizeEnv,
      maxRunMs: envNum("STOCK_ZONES_MAX_RUN_MS", 95_000),
      symbolTimeoutMs: envNum("STOCK_ZONES_SYMBOL_TIMEOUT_MS", 28_000),
      marketWindowIst: "Mon–Fri 9:00–16:00",
      expectedScansPerHour: Math.floor((60 / 5) * batchSizeEnv),
    },
    indices,
    recentBatchErrors,
  };
}
