import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import {
  buildCapitalCurveForExchange,
  type CapitalCurveDeployment,
} from "@/lib/freedombot/capital-curve";
import { CRYPTO_PERP_EXCHANGES } from "@/lib/crypto-bots";

export const dynamic = "force-dynamic";

function createdAtIso(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const d = (raw as { toDate?: () => Date })?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/**
 * GET /api/freedombot/capital-curve?exchange=BYBIT
 *
 * Wallet + per-bot capital curves for one exchange (shared futures wallet).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exchange = (req.nextUrl.searchParams.get("exchange") ?? "").toUpperCase();
    if (!exchange || !CRYPTO_PERP_EXCHANGES.includes(exchange as (typeof CRYPTO_PERP_EXCHANGES)[number])) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = getAdminFirestore();

    const snap = await db.collection("bot_deployments").where("uid", "==", uid).get();

    const deployments: CapitalCurveDeployment[] = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      const status = String(d.status ?? "").toLowerCase();
      if (status === "deleted") continue;
      const ex = String(d.exchange ?? "").toUpperCase();
      if (ex !== exchange) continue;
      deployments.push({
        id: doc.id,
        bot: String(d.bot ?? "CRYPTO"),
        createdAt: createdAtIso(d.createdAt),
        walletTotal: typeof d.walletTotal === "number" ? d.walletTotal : null,
        walletCheckedAt:
          typeof d.walletCheckedAt === "string" ? d.walletCheckedAt : null,
      });
    }

    if (deployments.length === 0) {
      return NextResponse.json({
        exchange,
        currency: "USDT",
        wallet: { points: [], latest: null },
        combinedBots: {
          baselineUsd: 0,
          totalPnlUsd: 0,
          returnPct: null,
          firstDeployAt: new Date().toISOString(),
          points: [],
        },
        bots: [],
        flows: [],
        hasWalletHistory: false,
      });
    }

    const payload = await buildCapitalCurveForExchange(db, uid, exchange, deployments);
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
