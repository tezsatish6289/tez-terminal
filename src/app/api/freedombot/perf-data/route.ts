import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import {
  loadPublicBotFlags,
  tradeIsFromPublicBot,
} from "@/lib/public-bot-flags";
import {
  ZONE_BOT_REGISTRY,
  type ZoneBotAsset,
} from "@/lib/zone-bot-config";
import { zoneSimStateDoc } from "@/lib/zone-bot-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSimStateDocId(assetType: string): string {
  if (!assetType || assetType === "CRYPTO") return "simulator_state";
  return `simulator_state_${assetType}`;
}

function mapTradeDoc(doc: QueryDocumentSnapshot) {
  const d = doc.data();
  return {
    id: doc.id,
    signalId: d.signalId ?? null,
    symbol: d.symbol ?? "—",
    side: d.side ?? "BUY",
    assetType: d.assetType ?? "CRYPTO",
    exchange: d.exchange ?? null,
    timeframe: d.timeframe ?? null,
    algo: d.algo ?? null,
    leverage: d.leverage ?? 1,
    entryPrice: d.entryPrice ?? null,
    currentPrice: d.currentPrice ?? null,
    tp1: d.tp1 ?? null,
    tp2: d.tp2 ?? null,
    tp3: d.tp3 ?? null,
    stopLoss: d.stopLoss ?? null,
    tp1Hit: d.tp1Hit ?? false,
    tp2Hit: d.tp2Hit ?? false,
    tp3Hit: d.tp3Hit ?? false,
    slHit: d.slHit ?? false,
    status: d.status ?? "OPEN",
    realizedPnl: d.realizedPnl ?? 0,
    unrealizedPnl: d.unrealizedPnl ?? 0,
    positionSize: d.positionSize ?? null,
    capitalAtEntry: d.capitalAtEntry ?? null,
    capitalAfter: d.capitalAfter ?? null,
    remainingPct: d.remainingPct ?? 1,
    closeReason: d.closeReason ?? null,
    openedAt: d.openedAt ?? null,
    closedAt: d.closedAt ?? null,
    events: d.events ?? [],
    confidenceScore: d.confidenceScore ?? null,
    scorePattern: d.scorePattern ?? null,
    currentScore: d.currentScore ?? null,
    currentScorePattern: d.currentScorePattern ?? null,
    confidenceScoreAtClose: d.confidenceScoreAtClose ?? null,
    scorePatternAtClose: d.scorePatternAtClose ?? null,
    botSource: typeof d.botSource === "string" ? d.botSource : null,
    // PR 2a debugging surface — `deliveredAs` is stamped at open time
    // by sync-simulator / sync-zone-bots / manual-open. Exposing it
    // here lets the simulation page (and ad-hoc curl) confirm
    // stamping mid-life without waiting for the trade to close.
    // Stays null for legacy trades opened before PR 2a.
    deliveredAs: Array.isArray(d.deliveredAs)
      ? (d.deliveredAs as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : null,
    txHash: (d.txHash as string) ?? null,
    blockchainStatus: (d.blockchainStatus as string) ?? null,
    blockchainError: (d.blockchainError as string) ?? null,
    blockchainConfirmedAt: (d.blockchainConfirmedAt as string) ?? null,
  };
}

async function requestIsInternal(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  try {
    await getAdminAuth().verifyIdToken(authHeader.slice(7));
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assetType = searchParams.get("assetType") ?? "CRYPTO";
    const internal = await requestIsInternal(req);

    const db = getAdminFirestore();

    const loadZoneStates =
      internal && assetType === "CRYPTO"
        ? Promise.all(
            ZONE_BOT_REGISTRY.map(async (asset) => {
              const snap = await db.doc(zoneSimStateDoc(asset)).get();
              if (!snap.exists) return [asset, null] as const;
              const data = snap.data() as {
                capital?: number;
                startingCapital?: number;
              };
              return [asset, data] as const;
            }),
          )
        : Promise.resolve([] as readonly (readonly [ZoneBotAsset, unknown])[]);

    const [stateDoc, tradesSnap, publicFlags, zoneSnaps] = await Promise.all([
      db.collection("config").doc(getSimStateDocId(assetType)).get(),
      db.collection("simulator_trades").orderBy("openedAt", "asc").get(),
      loadPublicBotFlags(db),
      loadZoneStates,
    ]);

    const state = stateDoc.exists ? (stateDoc.data() as Record<string, unknown>) : null;

    let trades = tradesSnap.docs
      .map(mapTradeDoc)
      .filter((t) => (t.assetType || "CRYPTO") === assetType);

    if (!internal && publicFlags) {
      trades = trades.filter((t) => tradeIsFromPublicBot(t, publicFlags));
    }

    const zoneSimStates =
      internal && zoneSnaps.length
        ? Object.fromEntries(
            zoneSnaps.filter(([, data]) => data != null).map(([asset, data]) => [asset, data]),
          )
        : undefined;

    return NextResponse.json(
      {
        state,
        trades,
        scope: internal ? "internal" : "public",
        ...(zoneSimStates ? { zoneSimStates } : {}),
        ...(internal ? { publicBotFlags: publicFlags } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
