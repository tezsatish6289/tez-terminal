import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadPublicBotFlags } from "@/lib/public-bot-flags";
import { CRYPTO_BOTS, cryptoBotByBotSource } from "@/lib/crypto-bots";
import type { CryptoBotId } from "@/lib/crypto-bots";

export const dynamic = "force-dynamic";

const BOT_IDS = new Set<CryptoBotId>(CRYPTO_BOTS.map((b) => b.id));

/**
 * GET /api/admin/blockchain-records
 * Admin-only: all closed crypto sim trades with blockchain + publish flags.
 * ?bot=btc|eth|sol|xrp|crypto|all (default all)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const botParam = request.nextUrl.searchParams.get("bot") ?? "all";
  const botFilter: CryptoBotId | "all" =
    botParam === "all" || BOT_IDS.has(botParam as CryptoBotId)
      ? (botParam as CryptoBotId | "all")
      : "all";

  try {
    const db = getAdminFirestore();
    const [snap, publicFlags] = await Promise.all([
      db
        .collection("simulator_trades")
        .where("status", "==", "CLOSED")
        .where("assetType", "==", "CRYPTO")
        .orderBy("openedAt", "desc")
        .limit(400)
        .get(),
      loadPublicBotFlags(db),
    ]);

    const trades = snap.docs
      .map((doc) => {
        const d = doc.data();
        const bot = cryptoBotByBotSource(
          typeof d.botSource === "string" ? d.botSource : null,
        );
        const botId = bot?.id ?? "crypto";
        return {
          id: doc.id,
          symbol: d.symbol as string,
          side: d.side as "BUY" | "SELL",
          botSource: typeof d.botSource === "string" ? d.botSource : null,
          botId,
          botLabel: bot?.label ?? "Crypto Bot",
          publicLive: publicFlags[botId as CryptoBotId] ?? false,
          entryPrice: d.entryPrice as number,
          currentPrice: (d.currentPrice as number) ?? null,
          realizedPnl: (d.realizedPnl as number) ?? 0,
          positionSize: (d.positionSize as number) ?? null,
          leverage: (d.leverage as number) ?? 1,
          closeReason: (d.closeReason as string) ?? null,
          openedAt: d.openedAt as string,
          closedAt: (d.closedAt as string) ?? null,
          txHash: (d.txHash as string) ?? null,
          blockchainStatus: (d.blockchainStatus as string) ?? null,
          blockchainError: (d.blockchainError as string) ?? null,
          blockchainConfirmedAt: (d.blockchainConfirmedAt as string) ?? null,
        };
      })
      .filter((t) => {
        if (botFilter === "all") return true;
        return t.botId === botFilter;
      });

    const summary = {
      total: trades.length,
      confirmed: trades.filter((t) => t.txHash).length,
      pending: trades.filter(
        (t) =>
          t.blockchainStatus === "pending" ||
          t.blockchainStatus === "processing",
      ).length,
      failed: trades.filter((t) => t.blockchainStatus === "failed").length,
      awaitingQueue: trades.filter(
        (t) => !t.txHash && !t.blockchainStatus,
      ).length,
    };

    return NextResponse.json({
      bots: CRYPTO_BOTS.map((b) => ({
        id: b.id,
        label: b.label,
        shortLabel: b.shortLabel,
        botSource: b.botSource,
        publicLive: publicFlags[b.id],
      })),
      botFilter,
      summary,
      trades,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin blockchain-records]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
