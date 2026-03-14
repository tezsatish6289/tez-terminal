import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getLeverage } from "@/lib/leverage";
import { getEffectivePnl } from "@/lib/pnl";

export const dynamic = "force-dynamic";

const TIMEFRAME_NAMES: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
};

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const db = getAdminFirestore();

    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);

    const snapshot = await db.collection("signals").get();
    const allDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

    const yesterdayRetired = allDocs.filter((s: any) => {
      if (s.status !== "INACTIVE") return false;
      if (s.autoFilterPassed !== true) return false;
      if (!s.receivedAt) return false;
      const t = new Date(s.receivedAt).getTime();
      return t >= yesterdayUTC.getTime() && t < todayUTC.getTime();
    });

    const scored = yesterdayRetired.map((s: any) => {
      const lev = getLeverage(s.timeframe);
      const pnl = getEffectivePnl(s) * lev;
      const entry = Number(s.price);
      const maxUpside = Number(s.maxUpsidePrice);
      const rawMaxReturn = entry > 0 && maxUpside > 0
        ? (s.type === "BUY" ? (maxUpside - entry) / entry : (entry - maxUpside) / entry) * 100 * lev
        : 0;

      return {
        symbol: s.symbol || "",
        side: s.type === "BUY" ? "LONG" : "SHORT",
        timeframe: TIMEFRAME_NAMES[String(s.timeframe)] || `${s.timeframe}m`,
        algo: s.algo || "V8 Reversal",
        entryPrice: entry,
        leverage: lev,
        pnl: Math.round(pnl * 100) / 100,
        maxReturn: Math.round(rawMaxReturn * 100) / 100,
        tp1Hit: s.tp1Hit === true,
        tp2Hit: s.tp2Hit === true,
        tp3Hit: s.tp3Hit === true,
        receivedAt: s.receivedAt,
      };
    });

    scored.sort((a, b) => b.pnl - a.pnl);

    const topWinner = scored.length > 0 ? scored[0] : null;
    const runnersUp = scored.slice(1, 5);
    const totalYesterday = yesterdayRetired.length;
    const wins = scored.filter((s) => s.pnl >= 0).length;

    const response = {
      date: yesterdayUTC.toISOString().slice(0, 10),
      cutoff: "00:00:00 UTC",
      topWinner,
      runnersUp,
      summary: {
        totalRetiredTrades: totalYesterday,
        winningTrades: wins,
        losingTrades: totalYesterday - wins,
        winRate: totalYesterday > 0 ? Math.round((wins / totalYesterday) * 10000) / 100 : 0,
      },
    };

    cache = { data: response, ts: Date.now() };
    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
