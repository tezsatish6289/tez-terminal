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
 *     npx tsx scripts/backfill-oi-history.ts [SYMBOL|ALL] [tradingDays]
 *
 *   SYMBOL       optional (default NIFTY); ALL = all five index symbols
 *   tradingDays  optional (default 120)
 */

export {}; // module scope (avoids global `main` collision with other scripts)

const CHUNK = 15; // trading days per request — ~4s/day via the India proxy, keep under the 120s function limit

const INDEX_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"] as const;

async function backfillSymbol(base: string, key: string, symbol: string, targetDays: number): Promise<void> {
  console.log(`\n=== ${symbol} (~${targetDays} trading days) ===`);

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
      throw new Error(`${symbol} chunk failed (HTTP ${res.status}): ${json.error ?? "unknown"}`);
    }

    const added = json.added ?? 0;
    total += added;
    console.log(
      `  +${added} days (stored total ${json.totalPoints ?? "?"}), earliest ${json.earliestDate ?? "?"}`,
    );

    if (added === 0 || !json.earliestDate) {
      console.log("  Reached start of available archives — stopping.");
      break;
    }

    const prev = new Date(`${json.earliestDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    before = prev.toISOString().slice(0, 10);
    remaining -= added;
  }

  console.log(`  Done. Added ~${total} trading days for ${symbol}.`);
}

async function main(): Promise<void> {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.CRON_SECRET;
  const rawSymbol = (process.argv[2] ?? "NIFTY").toUpperCase();
  const targetDays = Number(process.argv[3] ?? 120) || 120;

  if (!base) {
    console.error("Set APP_BASE_URL (e.g. https://tezterminal.com).");
    process.exit(1);
  }
  if (!key) {
    console.error("Set CRON_SECRET (matches the deployed env).");
    process.exit(1);
  }

  const symbols = rawSymbol === "ALL" ? [...INDEX_SYMBOLS] : [rawSymbol];
  console.log(`Backfilling OI history on ${base} for: ${symbols.join(", ")}`);

  for (const symbol of symbols) {
    await backfillSymbol(base, key, symbol, targetDays);
  }

  console.log("\nAll backfills finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
