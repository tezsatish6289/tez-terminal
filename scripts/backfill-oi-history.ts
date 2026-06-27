/**
 * One-time OI-wall history backfill (put wall / call wall / max pain per day).
 *
 * Triggers the deployed `/api/cron/oi-history?backfill=1` endpoint so the NSE
 * bhavcopy fetch runs server-side (where NSE is reachable / proxied and admin
 * credentials exist) — running it from a laptop hits NSE's geo block.
 *
 * The endpoint processes a bounded chunk per call and returns `earliestDate`;
 * this script pages backwards until the requested depth is filled.
 *
 * Usage:
 *   APP_BASE_URL=https://tezterminal.com CRON_SECRET=xxx \
 *     npx tsx scripts/backfill-oi-history.ts [SYMBOL] [tradingDays]
 *
 *   SYMBOL       optional (default NIFTY)
 *   tradingDays  optional (default 120)
 */

export {}; // module scope (avoids global `main` collision with other scripts)

const CHUNK = 15; // trading days per request — ~4s/day via the India proxy, keep under the 120s function limit

async function main(): Promise<void> {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.CRON_SECRET;
  const symbol = (process.argv[2] ?? "NIFTY").toUpperCase();
  const targetDays = Number(process.argv[3] ?? 120) || 120;

  if (!base) {
    console.error("Set APP_BASE_URL (e.g. https://tezterminal.com).");
    process.exit(1);
  }
  if (!key) {
    console.error("Set CRON_SECRET (matches the deployed env).");
    process.exit(1);
  }

  console.log(`Backfilling ${symbol} OI history (~${targetDays} trading days) on ${base} …`);

  let remaining = targetDays;
  let before: string | null = null;
  let total = 0;

  while (remaining > 0) {
    const chunk = Math.min(CHUNK, remaining);
    const url = new URL(`${base}/api/cron/oi-history`);
    url.searchParams.set("backfill", "1");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("days", String(chunk));
    if (before) url.searchParams.set("before", before);
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      added?: number;
      earliestDate?: string | null;
      totalPoints?: number;
      error?: string;
    };

    if (!res.ok || json.success === false) {
      console.error(`Chunk failed (HTTP ${res.status}): ${json.error ?? "unknown"}`);
      process.exit(1);
    }

    const added = json.added ?? 0;
    total += added;
    console.log(
      `  +${added} days (stored total ${json.totalPoints ?? "?"}), earliest ${json.earliestDate ?? "?"}`,
    );

    if (added === 0 || !json.earliestDate) {
      console.log("Reached start of available archives — stopping.");
      break;
    }

    // Page strictly before the earliest date reached.
    const prev = new Date(`${json.earliestDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    before = prev.toISOString().slice(0, 10);
    remaining -= added;
  }

  console.log(`Done. Added ~${total} trading days for ${symbol}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
