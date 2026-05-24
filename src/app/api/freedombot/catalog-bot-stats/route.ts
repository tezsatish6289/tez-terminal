import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { AggregateField } from "firebase-admin/firestore";
import { CRYPTO_BOTS, type CryptoBotId } from "@/lib/crypto-bots";
import {
  ZONE_BOT_REGISTRY,
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
  if (days != null) return Math.max(1, days);
  if (hasStats) return 1;
  return null;
}

type CatalogBotStats = Partial<Record<CryptoBotId, CatalogBotStatRow>>;

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } as const;

function runningDaysFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const startMs = new Date(iso).getTime();
  if (!Number.isFinite(startMs)) return null;
  return Math.max(1, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
}

async function cryptoPlatformStats(db: FirebaseFirestore.Firestore): Promise<CatalogBotStatRow | null> {
  const [stateDoc, metricsSnap, closedSum] = await Promise.all([
    db.collection("config").doc("simulator_state").get(),
    db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
    db
      .collection("simulator_trades")
      .where("assetType", "==", "CRYPTO")
      .where("status", "==", "CLOSED")
      .aggregate({ totalRealized: AggregateField.sum("realizedPnl") })
      .get()
      .then((snap) => snap.data()?.totalRealized ?? 0)
      .catch(async () => {
        const snap = await db
          .collection("simulator_trades")
          .where("assetType", "==", "CRYPTO")
          .where("status", "==", "CLOSED")
          .select("realizedPnl")
          .get();
        let sum = 0;
        snap.forEach((doc) => {
          const r = (doc.data() as { realizedPnl?: number }).realizedPnl;
          if (typeof r === "number") sum += r;
        });
        return sum;
      }),
  ]);

  if (!stateDoc.exists) return null;
  const state = stateDoc.data() as { startingCapital?: number; capital?: number };
  const startingCapital = Number(state.startingCapital ?? 0);
  if (!Number.isFinite(startingCapital) || startingCapital <= 0) return null;

  const liveCapital = Number(state.capital ?? startingCapital);
  const derivedCapital =
    typeof closedSum === "number" && Number.isFinite(closedSum)
      ? startingCapital + closedSum
      : liveCapital;

  const earliestMetricDate = metricsSnap.empty ? null : String(metricsSnap.docs[0].data().date ?? "");

  return {
    runningDays: runningDaysFromIso(earliestMetricDate),
    totalReturnPct: totalReturnPctFromEquity(startingCapital, derivedCapital),
  };
}

async function zoneBotStats(
  db: FirebaseFirestore.Firestore,
  asset: ZoneBotAsset,
): Promise<CatalogBotStatRow | null> {
  const simSnap = await db.doc(zoneSimStateDoc(asset)).get();
  if (!simSnap.exists) return null;
  const data = simSnap.data() as {
    capital?: number;
    startingCapital?: number;
    lastUpdated?: string;
  };
  const starting = Number(data.startingCapital ?? 0);
  const capital = Number(data.capital ?? starting);
  if (!Number.isFinite(starting) || starting <= 0) return null;

  const totalReturnPct = totalReturnPctFromEquity(starting, capital);

  return {
    runningDays: runningDaysFromIso(data.lastUpdated ?? null),
    totalReturnPct,
  };
}

/** Earliest trade per catalog bot (one query per botSource). */
async function runningDaysByBotId(
  db: FirebaseFirestore.Firestore,
): Promise<Partial<Record<CryptoBotId, number>>> {
  const out: Partial<Record<CryptoBotId, number>> = {};

  await Promise.all(
    CRYPTO_BOTS.map(async (bot) => {
      try {
        const snap = await db
          .collection("simulator_trades")
          .where("assetType", "==", "CRYPTO")
          .where("botSource", "==", bot.botSource)
          .orderBy("openedAt", "asc")
          .limit(1)
          .select("openedAt")
          .get();
        if (snap.empty) return;
        const openedAt = (snap.docs[0].data() as { openedAt?: string }).openedAt;
        const days = runningDaysFromIso(typeof openedAt === "string" ? openedAt : null);
        if (days != null) out[bot.id] = days;
      } catch (e) {
        console.warn(
          `[catalog-bot-stats] running days for ${bot.id}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  return out;
}

/**
 * GET /api/freedombot/catalog-bot-stats
 *
 * Per-bot headline stats for the dashboard discover cards (published bots).
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const stats: CatalogBotStats = {};

    const [cryptoRow, zoneRows, runningByBot] = await Promise.all([
      cryptoPlatformStats(db),
      Promise.all(
        ZONE_BOT_REGISTRY.map(async (asset) => {
          const row = await zoneBotStats(db, asset);
          return [asset, row] as const;
        }),
      ),
      runningDaysByBotId(db),
    ]);

    if (cryptoRow) {
      const hasStats = cryptoRow.totalReturnPct != null;
      stats.crypto = {
        ...cryptoRow,
        runningDays: ensureMinRunningDays(
          cryptoRow.runningDays ?? runningByBot.crypto ?? null,
          hasStats,
        ),
      };
    }

    for (const [asset, row] of zoneRows) {
      if (!row) continue;
      const hasStats = row.totalReturnPct != null;
      stats[asset] = {
        ...row,
        runningDays: ensureMinRunningDays(
          runningByBot[asset] ?? row.runningDays,
          hasStats,
        ),
      };
    }

    return NextResponse.json({ stats }, { headers: NO_STORE });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
