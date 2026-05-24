import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { AggregateField } from "firebase-admin/firestore";
import type { CryptoBotId } from "@/lib/crypto-bots";
import {
  ZONE_BOT_REGISTRY,
  type ZoneBotAsset,
} from "@/lib/zone-bot-config";
import { zoneSimStateDoc } from "@/lib/zone-bot-state";
import { cryptoBotByBotSource } from "@/lib/crypto-bots";

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
  const data = simSnap.data() as { capital?: number; startingCapital?: number };
  const starting = Number(data.startingCapital ?? 0);
  const capital = Number(data.capital ?? starting);
  if (!Number.isFinite(starting) || starting <= 0) return null;

  return {
    runningDays: null,
    totalReturnPct: totalReturnPctFromEquity(starting, capital),
  };
}

/** Earliest trade per catalog bot — fills runningDays for zone bots. */
async function earliestTradeDaysByBot(
  db: FirebaseFirestore.Firestore,
): Promise<Partial<Record<CryptoBotId, number>>> {
  const out: Partial<Record<CryptoBotId, number>> = {};
  try {
    const snap = await db
      .collection("simulator_trades")
      .where("assetType", "==", "CRYPTO")
      .orderBy("openedAt", "asc")
      .select("openedAt", "botSource")
      .limit(500)
      .get();

    const earliestByBot = new Map<CryptoBotId, string>();
    for (const doc of snap.docs) {
      const d = doc.data() as { openedAt?: string; botSource?: string | null };
      const openedAt = typeof d.openedAt === "string" ? d.openedAt : null;
      if (!openedAt) continue;
      const bot = cryptoBotByBotSource(d.botSource);
      const id = bot?.id ?? "crypto";
      if (!earliestByBot.has(id)) earliestByBot.set(id, openedAt);
    }

    for (const [id, iso] of earliestByBot) {
      const days = runningDaysFromIso(iso);
      if (days != null) out[id] = days;
    }
  } catch (e) {
    console.warn(
      "[catalog-bot-stats] earliest trade scan failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
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
      earliestTradeDaysByBot(db),
    ]);

    if (cryptoRow) {
      stats.crypto = {
        ...cryptoRow,
        runningDays: cryptoRow.runningDays ?? runningByBot.crypto ?? null,
      };
    }

    for (const [asset, row] of zoneRows) {
      if (!row) continue;
      stats[asset] = {
        ...row,
        runningDays: runningByBot[asset] ?? row.runningDays,
      };
    }

    return NextResponse.json({ stats }, { headers: NO_STORE });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
