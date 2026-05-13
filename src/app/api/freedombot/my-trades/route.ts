import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  loadCryptoCredentials,
  reconcileUserExchangeClosedPnl,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import type { ExchangeName } from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ trades: [] }, { status: 200 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getAdminFirestore();

    const { searchParams } = new URL(req.url);
    const wantReconcile =
      searchParams.get("reconcile") === "1" || searchParams.get("reconcile") === "true";
    const exchangeParam = searchParams.get("exchange")?.trim().toUpperCase() ?? "";

    let reconciliation: {
      reconciled: number;
      errors: string[];
      totalClosedExchangePnl: number;
      skippedNoApi: number;
    } | null = null;
    let reconcileSkipped: string | null = null;

    if (wantReconcile && exchangeParam) {
      if (!exchangeSupportsClosedPnlReconciliation(exchangeParam)) {
        reconcileSkipped = "exchange_no_closed_pnl_api";
      } else {
        const creds = await loadCryptoCredentials(db, uid, exchangeParam as ExchangeName);
        if (!creds) {
          reconcileSkipped = "no_credentials";
        } else {
          reconciliation = await reconcileUserExchangeClosedPnl(
            db,
            uid,
            exchangeParam as ExchangeName,
            creds,
          );
        }
      }
    }

    // Single equality filter — no composite index needed
    const snap = await db
      .collection("live_trades")
      .where("userId", "==", uid)
      .get();

    const trades = snap.docs
      .map((d) => {
        const t = d.data();
        // Only production trades (not testnet)
        if (t.testnet !== false) return null;
        const internal = Number(t.realizedPnl ?? 0);
        const ex =
          typeof t.exchangeRealizedPnl === "number" && !Number.isNaN(t.exchangeRealizedPnl)
            ? Number(t.exchangeRealizedPnl)
            : null;
        const ov =
          typeof t.exchangeRealizedPnlOverride === "number" &&
          !Number.isNaN(t.exchangeRealizedPnlOverride)
            ? Number(t.exchangeRealizedPnlOverride)
            : null;
        const effective = ov ?? ex ?? internal;
        return {
          id: d.id,
          exchange: t.exchange ?? null,
          symbol: t.signalSymbol ?? t.symbol ?? "—",
          side: t.side === "BUY" ? "LONG" : t.side === "SELL" ? "SHORT" : (t.side ?? "—"),
          status: t.status === "OPEN" ? "open" : "closed",
          /** Best value for P&L display: manual override → exchange → bot model. */
          realizedPnl: effective,
          realizedPnlInternal: internal,
          realizedPnlExchange: ex,
          exchangeRealizedPnlOverride: ov,
          exchangePnlReconciledAt: t.exchangePnlReconciledAt ?? null,
          unrealizedPnl: 0,
          positionSize: t.positionSize ?? null,
          leverage: t.leverage ?? 1,
          entryPrice: t.entryPrice ?? null,
          currentPrice: t.exchangeAvgExitPrice ?? t.currentPrice ?? null,
          capitalAtEntry: t.capitalAtEntry ?? null,
          blockchainTxHash: t.blockchainTxHash ?? null,
          openedAt: t.openedAt ?? null,
          closedAt: t.closedAt ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const A = a!;
        const B = b!;
        const aOpen = A.status === "open";
        const bOpen = B.status === "open";
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        if (aOpen && bOpen) {
          const ob = new Date(B.openedAt ?? 0).getTime();
          const oa = new Date(A.openedAt ?? 0).getTime();
          return ob - oa;
        }
        const cb = new Date(B.closedAt ?? 0).getTime();
        const ca = new Date(A.closedAt ?? 0).getTime();
        if (cb !== ca) return cb - ca;
        return B.id.localeCompare(A.id);
      });

    return NextResponse.json({
      trades,
      ...(reconciliation ? { reconciliation } : {}),
      ...(reconcileSkipped ? { reconcileSkipped } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
