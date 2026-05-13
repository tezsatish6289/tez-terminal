/**
 * /api/freedombot/sync-trade?tradeId=xxx
 *
 * Checks a single live_trade against the exchange in real time:
 *  - If the position is still open → updates unrealized PnL from mark price.
 *  - If the position is closed on exchange but Firestore still shows OPEN →
 *    fetches the realized PnL, marks the trade CLOSED, and sets exit price.
 *
 * Supported exchanges: any that implement getPosition + getClosedPnl
 * (currently Bybit and CoinDCX).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  loadCryptoCredentials,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import {
  getConnector,
  type ExchangeName,
} from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const { tradeId } = await req.json() as { tradeId?: string };
    if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

    const db = getAdminFirestore();

    // Load the trade doc and verify ownership
    const tradeDoc = await db.collection("live_trades").doc(tradeId).get();
    if (!tradeDoc.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    const t = tradeDoc.data()!;
    if (t.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (t.testnet !== false) return NextResponse.json({ error: "Testnet trade" }, { status: 400 });

    const exchange = (t.exchange ?? "BYBIT") as ExchangeName;
    const symbol = String(t.signalSymbol ?? t.symbol ?? "");
    if (!symbol) return NextResponse.json({ error: "No symbol on trade" }, { status: 400 });

    // Load exchange credentials
    const creds = await loadCryptoCredentials(db, uid, exchange);
    if (!creds) return NextResponse.json({ error: "No credentials found" }, { status: 400 });

    const connector = getConnector(exchange);
    const normalizedSymbol = connector.normalizeSymbol(symbol);
    const nowIso = new Date().toISOString();

    // ── Case 1: trade already CLOSED in Firestore — reconcile PnL only ──────
    if (t.status === "CLOSED") {
      if (typeof connector.getClosedPnl !== "function") {
        return NextResponse.json({ status: "closed", pnlReconciled: false, reason: "exchange_no_closed_pnl_api" });
      }
      const openedAtMs = new Date(String(t.openedAt ?? 0)).getTime();
      const closedAtMs = t.closedAt ? new Date(String(t.closedAt)).getTime() : Date.now();
      const records = await connector.getClosedPnl!(normalizedSymbol, creds, Math.max(0, openedAtMs - 120_000));
      const bufferMs = 3 * 60 * 60 * 1000;
      const exchangePnl = records.reduce((sum, r) => {
        const ts = (r.createdTime ?? 0) < 1e12 ? (r.createdTime ?? 0) * 1000 : (r.createdTime ?? 0);
        return ts >= openedAtMs && ts <= closedAtMs + bufferMs ? sum + r.closedPnl : sum;
      }, 0);
      await tradeDoc.ref.update({ exchangeRealizedPnl: Number(exchangePnl.toFixed(6)), exchangePnlReconciledAt: nowIso });
      return NextResponse.json({ status: "closed", pnlReconciled: true, exchangeRealizedPnl: Number(exchangePnl.toFixed(6)) });
    }

    // ── Case 2: trade is OPEN in Firestore — check live position ────────────
    const position = await connector.getPosition(normalizedSymbol, creds);

    if (position) {
      // Position still open — update unrealized PnL from mark price
      const unrealizedPnl = parseFloat(position.unRealizedProfit ?? "0");
      const markPrice = parseFloat(position.markPrice ?? "0");
      await tradeDoc.ref.update({
        unrealizedPnl: isFinite(unrealizedPnl) ? Number(unrealizedPnl.toFixed(6)) : 0,
        currentPrice:  isFinite(markPrice) && markPrice > 0 ? markPrice : t.currentPrice,
        lastSyncedAt: nowIso,
      });
      return NextResponse.json({ status: "open", unrealizedPnl });
    }

    // Position is GONE on exchange but Firestore still says OPEN → close it
    let exchangePnl = 0;
    let avgExitPrice: number | null = null;

    if (typeof connector.getClosedPnl === "function") {
      const openedAtMs = new Date(String(t.openedAt ?? 0)).getTime();
      const records = await connector.getClosedPnl!(normalizedSymbol, creds, Math.max(0, openedAtMs - 120_000));
      const bufferMs = 3 * 60 * 60 * 1000;
      const relevant = records.filter((r) => {
        const ts = (r.createdTime ?? 0) < 1e12 ? (r.createdTime ?? 0) * 1000 : (r.createdTime ?? 0);
        return ts >= openedAtMs && ts <= Date.now() + bufferMs;
      });
      exchangePnl = relevant.reduce((s, r) => s + r.closedPnl, 0);
      const lastRecord = relevant.sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0))[0];
      avgExitPrice = lastRecord ? (parseFloat(String(lastRecord.avgExitPrice ?? lastRecord.exitPrice ?? 0)) || null) : null;
    }

    await tradeDoc.ref.update({
      status: "CLOSED",
      closedAt: nowIso,
      closeReason: "SYNCED_FROM_EXCHANGE",
      exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
      exchangePnlReconciledAt: nowIso,
      ...(avgExitPrice ? { exchangeAvgExitPrice: avgExitPrice, currentPrice: avgExitPrice } : {}),
    });

    return NextResponse.json({
      status: "closed_now",
      exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
      avgExitPrice,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
