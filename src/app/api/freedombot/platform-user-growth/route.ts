import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { deployKeyFromBotSourceFilter } from "@/lib/crypto-bots";
import type { BotSourceFilter } from "@/lib/bot-source-constants";
import {
  buildPlatformUserGrowthSeries,
  type PlatformDeploymentRow,
} from "@/lib/freedombot/platform-user-growth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const BOT_SOURCE_FILTERS = new Set<string>([
  "ALL",
  "PATTERN",
  "BTC_ZONE",
  "ETH_ZONE",
  "SOL_ZONE",
  "XRP_ZONE",
]);

function firestoreIso(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  const ts = raw as { toDate?: () => Date };
  if (typeof ts?.toDate === "function") return ts.toDate().toISOString();
  return null;
}

async function requireAuth(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  try {
    await getAdminAuth().verifyIdToken(authHeader.slice(7));
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/freedombot/platform-user-growth?botSource=ALL|PATTERN|…
 *
 * Cumulative unique FreedomBot deployers by day since first deploy in scope.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawFilter = (searchParams.get("botSource") ?? "ALL").trim().toUpperCase();
    const botSource = BOT_SOURCE_FILTERS.has(rawFilter)
      ? (rawFilter as BotSourceFilter)
      : "ALL";
    const botFilter = deployKeyFromBotSourceFilter(botSource);

    const db = getAdminFirestore();
    const depSnap = await db.collection("bot_deployments").get();

    const deployments: PlatformDeploymentRow[] = depSnap.docs
      .map((d) => {
        const x = d.data();
        const createdAt = firestoreIso(x.createdAt);
        if (!createdAt) return null;
        return {
          uid: String(x.uid ?? ""),
          bot: String(x.bot ?? "").toUpperCase(),
          createdAt,
        };
      })
      .filter((row): row is PlatformDeploymentRow => row != null && !!row.uid);

    const series = buildPlatformUserGrowthSeries(deployments, botFilter);

    return NextResponse.json(
      {
        botSource,
        bot: botFilter,
        series,
      },
      { headers: NO_STORE },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[Platform user growth]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
