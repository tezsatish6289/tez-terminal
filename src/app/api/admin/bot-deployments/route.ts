import { NextRequest, NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { getDeploymentAggregates } from "@/lib/freedombot/aggregates";
import {
  computeMirroringStatus,
  loadMirroringFieldsForExchange,
  type MirroringFields,
} from "@/lib/freedombot/mirroring-status";

export const dynamic = "force-dynamic";

const BOT_LABELS: Record<string, string> = {
  CRYPTO: "Crypto Bot",
  INDIAN_STOCKS: "Indian Stock Bot",
  GOLD: "Gold Bot",
  SILVER: "Silver Bot",
};

function pnlCurrencyLabel(bot: string, exchange: string): string {
  if (exchange === "HYPERLIQUID") return "USDC";
  if (
    bot === "CRYPTO" ||
    exchange === "BYBIT" ||
    exchange === "BINANCE" ||
    exchange === "MEXC" ||
    exchange === "COINDCX"
  ) {
    return "USDT";
  }
  if (bot === "INDIAN_STOCKS" || exchange === "DHAN") return "INR";
  return "USDT";
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
      // Cached aggregates (may be missing on legacy rows — bootstrap on read).
      cachedOpenTradeCount?: number;
      cachedClosedTradeCount?: number;
      cachedLifetimeRealizedPnl?: number;
      // Cached wallet snapshot — set by deploy/cron/manual-refresh. Optional
      // because legacy rows predate this field; UI must tolerate undefined.
      walletTotal?: number;
      walletAvailable?: number;
      walletCurrency?: string;
      walletStatus?: "valid" | "invalid";
      walletError?: string | null;
      walletCheckedAt?: string;
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
        cachedOpenTradeCount: x.openTradeCount as number | undefined,
        cachedClosedTradeCount: x.closedTradeCount as number | undefined,
        cachedLifetimeRealizedPnl: x.lifetimeRealizedPnl as number | undefined,
        walletTotal: typeof x.walletTotal === "number" ? x.walletTotal : undefined,
        walletAvailable: typeof x.walletAvailable === "number" ? x.walletAvailable : undefined,
        walletCurrency: typeof x.walletCurrency === "string" ? x.walletCurrency : undefined,
        walletStatus:
          x.walletStatus === "valid" || x.walletStatus === "invalid" ? x.walletStatus : undefined,
        walletError: typeof x.walletError === "string" ? x.walletError : null,
        walletCheckedAt: typeof x.walletCheckedAt === "string" ? x.walletCheckedAt : undefined,
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

    const mirroringCache = new Map<string, MirroringFields>();

    const rows = await mapWithConcurrency(deployments, 8, async (dep) => {
      const u = userByUid.get(dep.uid);
      const email = u?.email ?? dep.email ?? null;
      const displayName = u?.displayName ?? dep.displayName ?? null;
      // Cached on the deployment doc; bootstraps with a full rebuild on the
      // very first read after this PR ships and any time the cache is missing.
      const aggregates = await getDeploymentAggregates(db, {
        uid: dep.uid,
        exchange: dep.exchange,
        openTradeCount: dep.cachedOpenTradeCount,
        closedTradeCount: dep.cachedClosedTradeCount,
        lifetimeRealizedPnl: dep.cachedLifetimeRealizedPnl,
      });
      const currency = pnlCurrencyLabel(dep.bot, dep.exchange);
      const createdIso = dep.createdAt?.toDate?.()?.toISOString() ?? null;
      const deploymentActive = dep.status === "active";
      const cacheKey = `${dep.uid}:${dep.exchange}`;
      let mirroringFields = mirroringCache.get(cacheKey);
      if (!mirroringFields) {
        mirroringFields = await loadMirroringFieldsForExchange(db, dep.uid, dep.exchange);
        mirroringCache.set(cacheKey, mirroringFields);
      }
      const mirroring = computeMirroringStatus(deploymentActive, mirroringFields);

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
        running: deploymentActive,
        autoTradeEnabled: mirroring.autoTradeEnabled,
        dailyLossHaltedToday: mirroring.dailyLossHaltedToday,
        liveMirroringActive: mirroring.liveMirroringActive,
        mirroringStatus: mirroring.status,
        mirroringLabel: mirroring.label,
        lifetimeRealizedPnl: aggregates.lifetimeRealizedPnl,
        openTradeCount: aggregates.openTradeCount,
        closedTradeCount: aggregates.closedTradeCount,
        aggregatesSource: aggregates.source,
        pnlCurrency: currency,
        pnlNote:
          "Lifetime realized PnL (closed trades only). Uses exchange-reported PnL when available; includes trading fees as reported by the exchange.",
        // Wallet / connection-health snapshot. `null` for legacy rows that
        // haven't been refreshed yet — the cron will fill them on its next
        // tick (or the admin can click "Refresh" on the detail page).
        wallet:
          dep.walletStatus
            ? {
                total: dep.walletTotal ?? null,
                available: dep.walletAvailable ?? null,
                currency: dep.walletCurrency ?? currency,
                status: dep.walletStatus,
                error: dep.walletError ?? null,
                checkedAt: dep.walletCheckedAt ?? null,
              }
            : null,
      };
    });

    return NextResponse.json({ deployments: rows, total: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Deployments]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
