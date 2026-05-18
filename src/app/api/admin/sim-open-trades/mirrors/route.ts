import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  buildExchangeSummary,
  liveDocToMirrorTrade,
  type LiveMirrorTrade,
} from "@/lib/admin/live-mirror-display";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sim-open-trades/mirrors?simTradeIds=a,b,c
 *
 * Returns live_trades (OPEN, mainnet) mirrored from the given simulator trade ids,
 * grouped by simTradeId and by exchange for the simulation ops UI.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("simTradeIds")?.trim() ?? "";
  const simTradeIds = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (simTradeIds.length === 0) {
    return NextResponse.json({
      mirrorsBySimTradeId: {},
      exchangeSummary: [],
      totalMirrors: 0,
    });
  }

  const idSet = new Set(simTradeIds);

  try {
    const db = getAdminFirestore();
    const snap = await db
      .collection("live_trades")
      .where("status", "==", "OPEN")
      .where("testnet", "==", false)
      .get();

    const matched = snap.docs.filter((d) => idSet.has(String(d.data().simTradeId ?? "")));

    const userIds = [...new Set(matched.map((d) => String(d.data().userId ?? "")).filter(Boolean))];
    const userById = new Map<string, { email: string | null; displayName: string | null }>();

    await Promise.all(
      userIds.map(async (uid) => {
        const u = await db.collection("users").doc(uid).get();
        const data = u.data();
        userById.set(uid, {
          email: (data?.email as string) ?? null,
          displayName: (data?.displayName as string) ?? null,
        });
      }),
    );

    const deployKey = (uid: string, exchange: string) => `${uid}:${exchange.toUpperCase()}`;
    const deploymentByKey = new Map<string, string>();

    const deploySnap = await db.collection("bot_deployments").where("status", "==", "active").get();
    for (const d of deploySnap.docs) {
      const x = d.data();
      const uid = String(x.uid ?? "");
      const exchange = String(x.exchange ?? "");
      if (uid && exchange) deploymentByKey.set(deployKey(uid, exchange), d.id);
    }

    const mirrors: LiveMirrorTrade[] = matched.map((d) => {
      const t = d.data();
      const uid = String(t.userId ?? "");
      const exchange = String(t.exchange ?? "");
      const user = userById.get(uid) ?? { email: null, displayName: null };
      const deploymentId = deploymentByKey.get(deployKey(uid, exchange)) ?? null;
      return liveDocToMirrorTrade(d.id, t as Record<string, unknown>, user, deploymentId);
    });

    const mirrorsBySimTradeId: Record<string, LiveMirrorTrade[]> = {};
    for (const id of simTradeIds) {
      mirrorsBySimTradeId[id] = [];
    }
    for (const m of mirrors) {
      const list = mirrorsBySimTradeId[m.simTradeId] ?? [];
      list.push(m);
      mirrorsBySimTradeId[m.simTradeId] = list;
    }
    for (const id of Object.keys(mirrorsBySimTradeId)) {
      mirrorsBySimTradeId[id]!.sort((a, b) =>
        (a.displayName ?? a.email ?? a.userId).localeCompare(
          b.displayName ?? b.email ?? b.userId,
        ),
      );
    }

    return NextResponse.json({
      mirrorsBySimTradeId,
      exchangeSummary: buildExchangeSummary(mirrors),
      totalMirrors: mirrors.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin sim-open-trades mirrors]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
