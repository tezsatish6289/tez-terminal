import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  loadTradingPrefsForDeployment,
  defaultTradingPrefsForBot,
} from "@/lib/freedombot/deployment-cap";
import { getDeploymentAggregates } from "@/lib/freedombot/aggregates";
import { sumLifetimeRealizedPnlForUser, listUserTradeExchanges } from "@/lib/freedombot/sum-lifetime-realized-pnl";

export const dynamic = "force-dynamic";

/**
 * GET /api/freedombot/my-deployment
 *
 * Returns the caller's bot deployments. Includes both `active` and
 * `paused` deployments (and historical `stopped` rows, which we surface
 * as `paused` because the lifecycle was collapsed — pause and stop now
 * mean the same thing: "bot is on file, keys are on file, no new entries").
 *
 * Deleted deployments (status === "deleted") are excluded because the
 * client cannot reactivate them; only Re-deploy can.
 *
 * Wallet snapshot fields (`wallet`) are passed through so the dashboard
 * can render the cached balance immediately on load, before the
 * background `test-connection` call returns a fresher value.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ deployment: null, deployments: [] }, { status: 200 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getAdminFirestore();

    // Single equality filter — no composite index needed at all.
    // Sort and filter by status entirely in code.
    const snap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .get();

    if (snap.empty) {
      return NextResponse.json({ deployment: null, deployments: [] });
    }

    type Row = Record<string, unknown> & { id: string };

    // Treat legacy "stopped" identically to "paused" — same effective
    // state (autoTradeEnabled flag is the dispatcher's real switch).
    const normalizeStatus = (raw: unknown): "active" | "paused" | "other" => {
      const s = String(raw ?? "").toLowerCase();
      if (s === "active") return "active";
      if (s === "paused" || s === "stopped") return "paused";
      return "other";
    };

    // `source: "auto"` marks deployment docs created by the backfill /
    // zone-bot opt-in flow for bots that aren't `publicLive` yet. We
    // hide them from the public dashboard until the bot ships — they
    // still exist for `live-execution` to enforce per-bot caps and
    // for aggregates to land. When a zone bot becomes publicLive, the
    // filter can be dropped or the doc flag flipped.
    const visible = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Row))
      .filter((d) => normalizeStatus(d.status) !== "other")
      .filter((d) => d.source !== "auto")
      .sort((a, b) => {
        const aMs = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bMs = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bMs - aMs;
      });

    if (visible.length === 0) {
      return NextResponse.json({ deployment: null, deployments: [] });
    }

    const mapDep = async (dep: Row) => {
      const status = normalizeStatus(dep.status);
      const walletStatusRaw = String(dep.walletStatus ?? "").toLowerCase();
      const walletStatus =
        walletStatusRaw === "valid" || walletStatusRaw === "invalid"
          ? walletStatusRaw
          : null;
      const exchangeKey = String(dep.exchange ?? "");
      const deployKey = String(dep.bot ?? "CRYPTO");
      const agg = await getDeploymentAggregates(db, {
        uid,
        exchange: exchangeKey,
        bot: deployKey,
        openTradeCount: dep.openTradeCount as number | undefined,
        closedTradeCount: dep.closedTradeCount as number | undefined,
        lifetimeRealizedPnl: dep.lifetimeRealizedPnl as number | undefined,
        aggregatesBot: dep.aggregatesBot as string | undefined,
      });
      // tradingPrefs comes from the deployment doc directly now, with
      // fallback to secrets and finally per-bot defaults — see
      // `loadTradingPrefsForDeployment`. Two deployments on the same
      // exchange (e.g. Crypto Bot + BTC Zone) now genuinely return
      // their own values instead of sharing one number.
      const tradingPrefs = dep.tradingPrefs
        ? await loadTradingPrefsForDeployment(db, uid, exchangeKey, deployKey, dep)
        : exchangeKey
          ? await loadTradingPrefsForDeployment(db, uid, exchangeKey, deployKey)
          : defaultTradingPrefsForBot(deployKey);
      return {
        id: dep.id,
        bot: dep.bot,
        exchange: dep.exchange,
        status,
        keyLastFour: typeof dep.keyLastFour === "string" ? dep.keyLastFour : null,
        createdAt:
          (dep.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
        pausedAt: typeof dep.pausedAt === "string" ? dep.pausedAt : null,
        lifetimeRealizedPnl: agg.lifetimeRealizedPnl,
        openTradeCount: agg.openTradeCount,
        closedTradeCount: agg.closedTradeCount,
        // Wallet snapshot — null if the deployment pre-dates wallet
        // tracking (the cron + the dashboard's on-load test-connection
        // call will populate it shortly).
        wallet: walletStatus
          ? {
              total: typeof dep.walletTotal === "number" ? dep.walletTotal : null,
              available:
                typeof dep.walletAvailable === "number" ? dep.walletAvailable : null,
              currency:
                typeof dep.walletCurrency === "string" ? dep.walletCurrency : null,
              status: walletStatus,
              error: typeof dep.walletError === "string" ? dep.walletError : null,
              checkedAt:
                typeof dep.walletCheckedAt === "string" ? dep.walletCheckedAt : null,
            }
          : null,
        tradingPrefs,
      };
    };

    const deployments = await Promise.all(visible.map(mapDep));

    const userDoc = await db.collection("users").doc(uid).get();
    const storedFirstBot = userDoc.data()?.freedombotFirstBot as
      | { bot?: string; exchange?: string; deployedAt?: string }
      | undefined;

    let firstBot: { bot: string; exchange: string; deployedAt: string | null } | null = null;
    if (storedFirstBot?.bot && storedFirstBot?.exchange) {
      firstBot = {
        bot: String(storedFirstBot.bot),
        exchange: String(storedFirstBot.exchange),
        deployedAt: typeof storedFirstBot.deployedAt === "string" ? storedFirstBot.deployedAt : null,
      };
    } else {
      const earliest = [...snap.docs]
        .map((d) => ({ id: d.id, ...d.data() } as Row))
        .filter((d) => normalizeStatus(d.status) !== "other")
        .sort((a, b) => {
          const aMs = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          const bMs = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          return aMs - bMs;
        })[0];
      if (earliest?.bot && earliest?.exchange) {
        firstBot = {
          bot: String(earliest.bot),
          exchange: String(earliest.exchange),
          deployedAt:
            (earliest.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
        };
      }
    }

    let lifetimeRealizedPnl = 0;
    let exchanges: string[] = [];
    try {
      lifetimeRealizedPnl = await sumLifetimeRealizedPnlForUser(db, uid);
      exchanges = await listUserTradeExchanges(db, uid);
    } catch (e) {
      console.warn(
        `[my-deployment] lifetime P&L resolve failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      lifetimeRealizedPnl = deployments.reduce(
        (sum, d) => sum + (d.lifetimeRealizedPnl ?? 0),
        0,
      );
      exchanges = [...new Set(deployments.map((d) => String(d.exchange ?? "")).filter(Boolean))].sort();
    }

    const exchangeSet = new Set(exchanges);
    for (const d of deployments) {
      if (d.exchange) exchangeSet.add(String(d.exchange));
    }
    exchanges = [...exchangeSet].sort();

    // `deployment` (singular) stays for backward-compat with older client
    // code paths. Prefer the most recent ACTIVE deployment; fall back to
    // the most recent paused one if there are no active rows. This way a
    // user who paused their only bot still sees the dashboard chrome and
    // can resume.
    const primary =
      visible.find((d) => normalizeStatus(d.status) === "active") ?? visible[0];

    return NextResponse.json({
      deployment: deployments.find((d) => d.id === primary.id) ?? deployments[0],
      deployments,
      summary: {
        lifetimeRealizedPnl,
        firstBot,
        exchanges,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
