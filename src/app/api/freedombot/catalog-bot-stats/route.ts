import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { buildEquityCurve } from "@/lib/equity-curve";
import { classifyBotSource } from "@/lib/bot-source-constants";
import { CRYPTO_BOTS, type CryptoBotId } from "@/lib/crypto-bots";
import {
  runningDaysForStatsFilter,
  startingCapitalForStatsFilter,
  type ZoneSimStatesMap,
} from "@/lib/stats-dashboard-capital";
import {
  ZONE_BOT_REGISTRY,
  ZONE_BOT_STARTING_CAPITAL_USD,
  type ZoneBotAsset,
} from "@/lib/zone-bot-config";
import { zoneSimStateDoc } from "@/lib/zone-bot-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface CatalogBotStatRow {
  runningDays: number | null;
  totalReturnPct: number | null;
}

function totalReturnPctFromEquity(startingCapital: number, currentCapital: number): number | null {
  if (!Number.isFinite(startingCapital) || startingCapital <= 0) return null;
  if (!Number.isFinite(currentCapital)) return null;
  return Math.round(((currentCapital - startingCapital) / startingCapital) * 100 * 100) / 100;
}

function ensureMinRunningDays(days: number | null, hasStats: boolean): number | null {
  if (days != null && days > 0) return Math.max(1, days);
  if (hasStats) return 1;
  return null;
}

type CatalogBotStats = Partial<Record<CryptoBotId, CatalogBotStatRow>>;

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } as const;

interface ClosedTradeRow {
  botSource?: string | null;
  closedAt?: string | null;
  realizedPnl?: number | null;
  openedAt?: string | null;
}

async function loadClosedCryptoTrades(db: FirebaseFirestore.Firestore): Promise<ClosedTradeRow[]> {
  const snap = await db
    .collection("simulator_trades")
    .where("assetType", "==", "CRYPTO")
    .where("status", "==", "CLOSED")
    .select("botSource", "closedAt", "realizedPnl", "openedAt")
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data() as ClosedTradeRow;
    return {
      botSource: typeof d.botSource === "string" ? d.botSource : null,
      closedAt: d.closedAt ?? null,
      realizedPnl: typeof d.realizedPnl === "number" ? d.realizedPnl : 0,
      openedAt: d.openedAt ?? null,
    };
  });
}

async function loadPlatformContext(db: FirebaseFirestore.Firestore): Promise<{
  sharedStartingCapital: number;
  serverRunningDays: number | null;
  zoneSimStates: ZoneSimStatesMap;
}> {
  const [stateDoc, metricsSnap, zoneSnaps] = await Promise.all([
    db.collection("config").doc("simulator_state").get(),
    db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
    Promise.all(
      ZONE_BOT_REGISTRY.map(async (asset) => {
        const snap = await db.doc(zoneSimStateDoc(asset)).get();
        if (!snap.exists) return [asset, null] as const;
        const data = snap.data() as { capital?: number; startingCapital?: number };
        return [asset, data] as const;
      }),
    ),
  ]);

  const state = stateDoc.exists
    ? (stateDoc.data() as { startingCapital?: number })
    : null;
  const sharedStartingCapital = Number(state?.startingCapital ?? ZONE_BOT_STARTING_CAPITAL_USD);

  const earliestMetricDate = metricsSnap.empty
    ? null
    : String(metricsSnap.docs[0].data().date ?? "");
  let serverRunningDays: number | null = null;
  if (earliestMetricDate) {
    const startMs = new Date(earliestMetricDate).getTime();
    if (Number.isFinite(startMs)) {
      serverRunningDays = Math.max(
        1,
        Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)),
      );
    }
  }

  const zoneSimStates: ZoneSimStatesMap = Object.fromEntries(
    zoneSnaps.filter(([, data]) => data != null).map(([asset, data]) => [asset, data!]),
  );

  return { sharedStartingCapital, serverRunningDays, zoneSimStates };
}

function statsForBot(
  botId: CryptoBotId,
  trades: ClosedTradeRow[],
  sharedStartingCapital: number,
  serverRunningDays: number | null,
  zoneSimStates: ZoneSimStatesMap,
): CatalogBotStatRow | null {
  const bot = CRYPTO_BOTS.find((b) => b.id === botId);
  if (!bot) return null;

  const filtered = trades.filter(
    (t) => classifyBotSource(t.botSource) === bot.botSource,
  );
  if (filtered.length === 0) return null;

  const startingCapital = startingCapitalForStatsFilter(
    bot.botSource,
    { startingCapital: sharedStartingCapital },
    zoneSimStates,
  );
  const derivedCapital = buildEquityCurve(filtered, startingCapital).finalCapital;
  const totalReturnPct = totalReturnPctFromEquity(startingCapital, derivedCapital);
  const hasStats = totalReturnPct != null;

  const runningDays = ensureMinRunningDays(
    serverRunningDays ??
      runningDaysForStatsFilter(bot.botSource, serverRunningDays ?? undefined, filtered),
    hasStats,
  );

  return { runningDays, totalReturnPct };
}

/**
 * GET /api/freedombot/catalog-bot-stats
 *
 * Per-bot headline stats for dashboard discover cards — same equity-curve
 * math as /freedombot/performance (filtered by botSource, not all CRYPTO).
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const [trades, platform] = await Promise.all([
      loadClosedCryptoTrades(db),
      loadPlatformContext(db),
    ]);

    const stats: CatalogBotStats = {};
    for (const bot of CRYPTO_BOTS) {
      const row = statsForBot(
        bot.id,
        trades,
        platform.sharedStartingCapital,
        platform.serverRunningDays,
        platform.zoneSimStates,
      );
      if (row) stats[bot.id] = row;
    }

    return NextResponse.json({ stats }, { headers: NO_STORE });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
