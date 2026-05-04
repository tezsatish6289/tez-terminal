import { NextRequest, NextResponse } from "next/server";
import type { Firestore, Query, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const BOT_LABELS: Record<string, string> = {
  CRYPTO: "Crypto Bot",
  INDIAN_STOCKS: "Indian Stock Bot",
  GOLD: "Gold Bot",
  SILVER: "Silver Bot",
};

function pnlCurrencyLabel(bot: string, exchange: string): string {
  if (bot === "CRYPTO" || exchange === "BYBIT" || exchange === "BINANCE") return "USDT";
  if (bot === "INDIAN_STOCKS" || exchange === "DHAN") return "INR";
  return "USDT";
}

async function sumLifetimeRealizedPnl(
  db: Firestore,
  userId: string,
  exchange: string
): Promise<number> {
  let total = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;
  const PAGE = 400;

  while (true) {
    let q: Query = db
      .collection("live_trades")
      .where("userId", "==", userId)
      .where("exchange", "==", exchange)
      .where("status", "==", "CLOSED")
      .where("testnet", "==", false)
      .orderBy("openedAt", "asc")
      .limit(PAGE);

    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    for (const doc of snap.docs) {
      const t = doc.data();
      const pnl = t.exchangeRealizedPnl ?? t.realizedPnl ?? 0;
      total += typeof pnl === "number" && !Number.isNaN(pnl) ? pnl : 0;
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return Math.round(total * 10000) / 10000;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * GET /api/admin/bot-deployments?bot=CRYPTO — optional filter by bot type (e.g. CRYPTO).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const botFilter = searchParams.get("bot")?.trim().toUpperCase() || null;

    const db = getAdminFirestore();

    const depSnap = await db.collection("bot_deployments").orderBy("createdAt", "desc").get();

    type DepDoc = {
      id: string;
      uid: string;
      email: string | null;
      displayName: string | null;
      bot: string;
      exchange: string;
      status: string;
      createdAt: { toDate?: () => Date } | null;
    };

    let deployments: DepDoc[] = depSnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        uid: String(x.uid ?? ""),
        email: (x.email as string) ?? null,
        displayName: (x.displayName as string) ?? null,
        bot: String(x.bot ?? ""),
        exchange: String(x.exchange ?? ""),
        status: String(x.status ?? ""),
        createdAt: (x.createdAt as DepDoc["createdAt"]) ?? null,
      };
    });

    if (botFilter) {
      deployments = deployments.filter((d) => d.bot === botFilter);
    }

    const uids = [...new Set(deployments.map((d) => d.uid))];
    const userSnaps = await mapWithConcurrency(uids, 16, (uid) =>
      db.collection("users").doc(uid).get()
    );
    const userByUid = new Map<string, DocumentData>();
    userSnaps.forEach((doc) => {
      if (doc.exists) userByUid.set(doc.id, doc.data()!);
    });

    const rows = await mapWithConcurrency(deployments, 8, async (dep) => {
      const u = userByUid.get(dep.uid);
      const email = u?.email ?? dep.email ?? null;
      const displayName = u?.displayName ?? dep.displayName ?? null;
      const lifetimeRealizedPnl = await sumLifetimeRealizedPnl(db, dep.uid, dep.exchange);
      const currency = pnlCurrencyLabel(dep.bot, dep.exchange);
      const createdIso = dep.createdAt?.toDate?.()?.toISOString() ?? null;

      return {
        deploymentId: dep.id,
        userId: dep.uid,
        email,
        displayName,
        bot: dep.bot,
        botLabel: BOT_LABELS[dep.bot] ?? dep.bot,
        exchange: dep.exchange,
        firstDeployedAt: createdIso,
        deploymentStatus: dep.status,
        running: dep.status === "active",
        lifetimeRealizedPnl,
        pnlCurrency: currency,
        pnlNote:
          "Lifetime realized PnL (closed trades only). Uses exchange-reported PnL when available; includes trading fees as reported by the exchange.",
      };
    });

    return NextResponse.json({ deployments: rows, total: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Deployments]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
