import type { Firestore } from "firebase-admin/firestore";
import {
  buildExchangeSummary,
  liveDocToMirrorTrade,
  type ExchangeMirrorSummary,
  type LiveMirrorTrade,
} from "@/lib/admin/live-mirror-display";

export interface SimLiveMirrorsResult {
  mirrors: LiveMirrorTrade[];
  mirrorsBySimTradeId: Record<string, LiveMirrorTrade[]>;
  exchangeSummary: ExchangeMirrorSummary[];
  totalMirrors: number;
}

export async function loadMirrorsForSimTradeIds(
  db: Firestore,
  simTradeIds: string[],
): Promise<SimLiveMirrorsResult> {
  const idSet = new Set(simTradeIds.filter(Boolean));
  if (idSet.size === 0) {
    return {
      mirrors: [],
      mirrorsBySimTradeId: {},
      exchangeSummary: [],
      totalMirrors: 0,
    };
  }

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

  return {
    mirrors,
    mirrorsBySimTradeId,
    exchangeSummary: buildExchangeSummary(mirrors),
    totalMirrors: mirrors.length,
  };
}
