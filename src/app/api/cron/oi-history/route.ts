/**
 * /api/cron/oi-history — backfill + verify the OI-wall history series.
 *
 * Key-gated (CRON_SECRET), like the other cron/maintenance routes, so it's
 * triggerable from `scripts/backfill-oi-history.ts` or cron-job.org without an
 * admin session. Runs server-side because NSE's archive host geo-blocks
 * datacenter IPs (uses the same NSE_HTTPS_PROXY egress as the live fetch).
 *
 * Modes (GET):
 *   • ?backfill=1&symbol=NIFTY&days=60&before=YYYY-MM-DD
 *       → walk bhavcopy archives back from `before` (default today), add up to
 *         `days` trading days, merge into config/oi_history_NIFTY. Returns
 *         `earliestDate` so the caller can page deeper.
 *   • ?verify=1&symbol=NIFTY&date=YYYY-MM-DD
 *       → fetch one day's bhavcopy and return the computed snapshot + counts.
 *   • (default)&symbol=NIFTY
 *       → report what's currently stored (point count + last few rows).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getNseCookies } from "@/lib/nse-session";
import {
  computeOiSnapshot,
  fetchFoBhavcopyCsv,
  parseFoBhavcopyCsv,
} from "@/lib/nse/fo-bhavcopy";
import { backfillOiHistory } from "@/lib/oi-history-backfill";
import { loadOiHistory } from "@/lib/oi-history";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const symbol = (params.get("symbol") ?? "NIFTY").toUpperCase();
  const db = getAdminFirestore();

  try {
    if (params.get("verify") === "1") {
      const dateStr = params.get("date");
      const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? new Date(`${dateStr}T00:00:00Z`)
        : new Date();
      const cookies = await getNseCookies().catch(() => "");
      const csv = await fetchFoBhavcopyCsv(date, cookies);
      if (!csv) {
        return NextResponse.json({ success: true, mode: "verify", symbol, file: "missing (holiday/not-published)" });
      }
      const rows = parseFoBhavcopyCsv(csv);
      const symRows = rows.filter((r) => r.symbol === symbol);
      const snapshot = computeOiSnapshot(rows, symbol, date.toISOString().slice(0, 10));
      return NextResponse.json({
        success: true,
        mode: "verify",
        symbol,
        date: date.toISOString().slice(0, 10),
        totalOptionRows: rows.length,
        symbolRows: symRows.length,
        expiries: [...new Set(symRows.map((r) => r.expiry))].sort().slice(0, 6),
        snapshot,
      });
    }

    if (params.get("backfill") === "1") {
      const days = Number(params.get("days") ?? 60) || 60;
      const before = params.get("before");
      const result = await backfillOiHistory(db, {
        symbol,
        before,
        maxTradingDays: days,
      });
      return NextResponse.json({ success: true, mode: "backfill", ...result });
    }

    const loaded = await loadOiHistory(db, symbol);
    return NextResponse.json({
      success: true,
      mode: "status",
      symbol,
      totalPoints: loaded.entries.length,
      firstDate: loaded.entries[0]?.date ?? null,
      lastDate: loaded.lastDate,
      sample: loaded.entries.slice(-5),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[oi-history] ${symbol} failed:`, msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
