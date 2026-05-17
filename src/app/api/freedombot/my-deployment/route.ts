import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";

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

    const visible = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Row))
      .filter((d) => normalizeStatus(d.status) !== "other")
      .sort((a, b) => {
        const aMs = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bMs = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bMs - aMs;
      });

    if (visible.length === 0) {
      return NextResponse.json({ deployment: null, deployments: [] });
    }

    const mapDep = (dep: Row) => {
      const status = normalizeStatus(dep.status);
      const walletStatusRaw = String(dep.walletStatus ?? "").toLowerCase();
      const walletStatus =
        walletStatusRaw === "valid" || walletStatusRaw === "invalid"
          ? walletStatusRaw
          : null;
      return {
        id: dep.id,
        bot: dep.bot,
        exchange: dep.exchange,
        status,
        keyLastFour: typeof dep.keyLastFour === "string" ? dep.keyLastFour : null,
        createdAt:
          (dep.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
        pausedAt: typeof dep.pausedAt === "string" ? dep.pausedAt : null,
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
      };
    };

    const deployments = visible.map(mapDep);

    // `deployment` (singular) stays for backward-compat with older client
    // code paths. Prefer the most recent ACTIVE deployment; fall back to
    // the most recent paused one if there are no active rows. This way a
    // user who paused their only bot still sees the dashboard chrome and
    // can resume.
    const primary =
      visible.find((d) => normalizeStatus(d.status) === "active") ?? visible[0];

    return NextResponse.json({
      deployment: mapDep(primary),
      deployments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
