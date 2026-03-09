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
  "D": "Buy & Hold",
};

const TIMEFRAME_CHART: Record<string, string> = {
  "5": "5M",
  "15": "15M",
  "60": "1H",
  "240": "4H",
  "D": "1D",
};

const TIMEFRAME_IDS = ["5", "15", "60", "240", "D"];

const ROLLING_WINDOW_DAYS: Record<string, number> = {
  "5": 7,
  "15": 14,
  "60": 30,
  "240": 60,
  "D": 90,
};

interface Winner {
  symbol: string;
  type: "LONG" | "SHORT";
  timeframe: string;
  timeframeId: string;
  maxReturn: string;
  maxReturnNum: number;
  leverage: string;
  receivedAt: string;
  ago: string;
  algo: string;
}

function formatAgo(receivedAt: string): string {
  const ms = Date.now() - new Date(receivedAt).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const db = getAdminFirestore();

    const snapshot = await db.collection("signals").get();

    const allDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

    const cryptoSignals = allDocs.filter(
      (s: any) =>
        (s.assetType === "CRYPTO" || s.asset_type === "CRYPTO") &&
        s.autoFilterPassed === true
    );

    // Stats: total crypto signals + days since platform start
    let earliestMs = Infinity;
    for (const s of cryptoSignals) {
      if (s.receivedAt) {
        const t = new Date(s.receivedAt).getTime();
        if (!isNaN(t) && t < earliestMs) earliestMs = t;
      }
    }

    const now = Date.now();
    const msSinceStart = earliestMs < Infinity ? now - earliestMs : 0;
    const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));
    const hoursSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60));

    const stats = {
      totalTrades: cryptoSignals.length,
      days: daysSinceStart,
      hours: hoursSinceStart,
    };

    const bestByTfAndDir: Record<string, Record<string, Winner>> = {};

    for (const s of cryptoSignals) {

      const tf = String(s.timeframe || "");
      if (!TIMEFRAME_IDS.includes(tf)) continue;

      if (!s.receivedAt) continue;
      const windowDays = ROLLING_WINDOW_DAYS[tf] || 30;
      const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
      const signalTime = new Date(s.receivedAt).getTime();
      if (isNaN(signalTime) || signalTime < cutoff) continue;

      const entry = Number(s.price);
      const maxUpside = Number(s.maxUpsidePrice);
      if (!entry || isNaN(entry)) continue;
      if (!maxUpside || isNaN(maxUpside)) continue;

      const isBuy = s.type === "BUY";
      const rawPnl = isBuy ? (maxUpside - entry) / entry : (entry - maxUpside) / entry;
      if (rawPnl <= 0) continue;

      const leverage = getLeverage(tf);
      const leveragedReturn = rawPnl * 100 * leverage;

      const dir = isBuy ? "LONG" : "SHORT";

      if (!bestByTfAndDir[tf]) bestByTfAndDir[tf] = {};

      const existing = bestByTfAndDir[tf][dir];
      if (!existing || leveragedReturn > existing.maxReturnNum) {
        bestByTfAndDir[tf][dir] = {
          symbol: s.symbol || "",
          type: dir,
          timeframe: TIMEFRAME_NAMES[tf] || tf,
          timeframeId: tf,
          maxReturn: `+${leveragedReturn.toFixed(2)}%`,
          maxReturnNum: leveragedReturn,
          leverage: `${leverage}x`,
          receivedAt: s.receivedAt,
          ago: formatAgo(s.receivedAt),
          algo: s.algo || "V8 Reversal",
        };
      }
    }

    const pool: Winner[] = [];
    for (const tf of TIMEFRAME_IDS) {
      const dirs = bestByTfAndDir[tf];
      if (!dirs) continue;
      if (dirs["LONG"]) pool.push(dirs["LONG"]);
      if (dirs["SHORT"]) pool.push(dirs["SHORT"]);
    }

    const picked: Winner[] = [];

    for (const tf of TIMEFRAME_IDS) {
      const dirs = bestByTfAndDir[tf];
      if (!dirs) continue;
      const candidates = Object.values(dirs).sort((a, b) => b.maxReturnNum - a.maxReturnNum);
      if (candidates.length > 0) {
        picked.push(candidates[0]);
      }
    }

    // Direction balance: ensure at least 2 of each direction
    const longs = picked.filter((w) => w.type === "LONG").length;
    const shorts = picked.filter((w) => w.type === "SHORT").length;
    const minDir = longs < shorts ? "LONG" : "SHORT";
    const maxDir = minDir === "LONG" ? "SHORT" : "LONG";
    const minCount = Math.min(longs, shorts);

    if (minCount < 2 && picked.length >= 3) {
      const dominantSorted = picked
        .filter((w) => w.type === maxDir)
        .sort((a, b) => a.maxReturnNum - b.maxReturnNum);

      for (const weakest of dominantSorted) {
        const currentMin = picked.filter((w) => w.type === minDir).length;
        if (currentMin >= 2) break;
        const alt = bestByTfAndDir[weakest.timeframeId]?.[minDir];
        if (alt) {
          const idx = picked.findIndex((w) => w === weakest);
          if (idx !== -1) {
            picked[idx] = alt;
          }
        }
      }
    }

    // Fill to 6 from remaining pool
    const pickedSymbols = new Set(picked.map((w) => w.symbol));
    const remaining = pool
      .filter((w) => !pickedSymbols.has(w.symbol))
      .sort((a, b) => b.maxReturnNum - a.maxReturnNum);

    for (const r of remaining) {
      if (picked.length >= 6) break;
      picked.push(r);
    }

    picked.sort((a, b) => b.maxReturnNum - a.maxReturnNum);

    const result = picked.slice(0, 6).map(({ maxReturnNum, timeframeId, ...rest }) => rest);

    // Aggregate performance by timeframe (retired signals only for reliable stats)
    const performance = TIMEFRAME_IDS.map((tfId) => {
      const tfSignals = cryptoSignals.filter(
        (s: any) => String(s.timeframe) === tfId && s.status === "INACTIVE"
      );
      const total = tfSignals.length;
      const lev = getLeverage(tfId);
      const pnls = tfSignals.map((s: any) => getEffectivePnl(s) * lev);
      const wins = pnls.filter((p: number) => p >= 0).length;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      const profitPnls = pnls.filter((p: number) => p > 0);
      const lossPnls = pnls.filter((p: number) => p < 0);
      const avgProfit = profitPnls.length > 0 ? profitPnls.reduce((a: number, b: number) => a + b, 0) / profitPnls.length : 0;
      const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a: number, b: number) => a + b, 0) / lossPnls.length : 0;
      const grossProfit = profitPnls.reduce((a: number, b: number) => a + b, 0);
      const grossLoss = Math.abs(lossPnls.reduce((a: number, b: number) => a + b, 0));
      const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 999 : 0;

      return {
        timeframe: TIMEFRAME_NAMES[tfId] || tfId,
        chart: TIMEFRAME_CHART[tfId] || tfId,
        leverage: `${lev}x`,
        trades: total,
        winRate: +winRate.toFixed(1),
        avgProfit: +avgProfit.toFixed(2),
        avgLoss: +avgLoss.toFixed(2),
        profitFactor,
      };
    }).filter((p) => p.trades > 0);

    // Trade frequency per timeframe (all signals, not just retired)
    const frequency = TIMEFRAME_IDS.map((tfId) => {
      const tfAll = cryptoSignals.filter((s: any) => String(s.timeframe) === tfId);
      if (tfAll.length === 0) return null;

      let earliest = Infinity;
      for (const s of tfAll) {
        if (s.receivedAt) {
          const t = new Date(s.receivedAt).getTime();
          if (!isNaN(t) && t < earliest) earliest = t;
        }
      }

      const daysActive = earliest < Infinity ? Math.max(1, (now - earliest) / (1000 * 60 * 60 * 24)) : 1;
      const perDay = tfAll.length / daysActive;

      let freqValue: number;
      let freqUnit: string;
      if (perDay >= 1) {
        freqValue = Math.round(perDay);
        freqUnit = "day";
      } else if (perDay >= 1 / 7) {
        freqValue = Math.round(perDay * 7);
        freqUnit = "week";
      } else {
        freqValue = Math.round(perDay * 30);
        freqUnit = "month";
      }

      return {
        timeframe: TIMEFRAME_NAMES[tfId] || tfId,
        freqValue: Math.max(1, freqValue),
        freqUnit,
      };
    }).filter(Boolean);

    const response = { winners: result, stats, performance, frequency };
    cache = { data: response, ts: Date.now() };

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
