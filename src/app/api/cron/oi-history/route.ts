/**
 * /api/cron/oi-history — backfill, daily append, and verify the OI-wall history series.
 *
 * Key-gated (CRON_SECRET), like the other cron/maintenance routes, so it's
 * triggerable from `scripts/backfill-oi-history.ts` or cron-job.org without an
 * admin session. Runs server-side because NSE's archive host geo-blocks
 * datacenter IPs (uses the same NSE_HTTPS_PROXY egress as the live fetch).
 *
 * Modes (GET):
 *   • ?cacheDaily=1
 *       → the scalable daily cron: cache the latest completed session's bhavcopy
 *         (zip + compact all-symbol snapshot) into GCS in the background. Returns
 *         202 immediately so cron-job.org's 30s cap never trips. Per-symbol docs
 *         materialize lazily when a chart opens (`ensureOiHistory`).
 *         Schedule Mon–Fri ~17:30 IST: `/api/cron/oi-history?cacheDaily=1&key=…`
 *   • ?cache=1&days=15&before=YYYY-MM-DD
 *       → one-time GCS backfill: page trading days backward, cache each day for
 *         ALL symbols. Returns `earliestDate` to page deeper (drive from
 *         scripts/cache-bhavcopy.ts).
 *   • ?append=1  (legacy index path — kept until the GCS path is proven)
 *       → append missing trading days for the five index symbols.
 *   • ?backfill=1&symbol=NIFTY&days=60&before=YYYY-MM-DD  (legacy per-symbol)
 *   • ?verify=1&symbol=NIFTY&date=YYYY-MM-DD
 *   • (default)&symbol=NIFTY → stored-series status.
 */

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS } from "@/lib/index-specs";
import { getNseCookies } from "@/lib/nse-session";
import {
  computeOiSnapshot,
  fetchFoBhavcopyCsv,
  parseFoBhavcopyCsv,
} from "@/lib/nse/fo-bhavcopy";
import { backfillOiHistory } from "@/lib/oi-history-backfill";
import { cacheBhavcopyRange, cacheRecentBhavcopy } from "@/lib/oi-bhavcopy-backfill";
import { appendDailyOiHistory } from "@/lib/oi-history-daily";
import { loadOiHistory } from "@/lib/oi-history";
import { warmExistingOiHistories } from "@/lib/oi-history-ensure";

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
    if (params.get("cacheDaily") === "1") {
      // 202 fast; cache work continues in the background (cron-job.org 30s cap).
      const maxDays = Number(params.get("days") ?? 5) || 5;
      after(async () => {
        try {
          const res = await cacheRecentBhavcopy(maxDays);
          console.log(
            `[oi-history] cacheDaily cached=${res.cached.join(",") || "-"} ` +
              `already=${res.alreadyCached.join(",") || "-"} missing=${res.missing.join(",") || "-"}`,
          );
          // Pre-materialize per-symbol series from the just-cached bhavcopy so a
          // chart open is a single Firestore read (no on-event GCS probing).
          const warm = await warmExistingOiHistories(db);
          console.log(
            `[oi-history] cacheDaily warmed symbols=${warm.symbols} updated=${warm.updated} fresh=${warm.fresh}`,
          );
        } catch (e) {
          console.error("[oi-history] cacheDaily background failed:", e instanceof Error ? e.message : String(e));
        }
      });
      return NextResponse.json({ success: true, mode: "cacheDaily", accepted: true });
    }

    if (params.get("cache") === "1") {
      const days = Number(params.get("days") ?? 15) || 15;
      const before = params.get("before");
      const result = await cacheBhavcopyRange({ before, maxTradingDays: days });
      return NextResponse.json({ success: true, mode: "cache", ...result });
    }

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

    if (params.get("append") === "1") {
      const result = await appendDailyOiHistory(db);
      return NextResponse.json({
        success: true,
        mode: "append",
        indices: INDEX_KEYS,
        ...result,
      });
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
