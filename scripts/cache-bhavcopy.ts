/**
 * One-time GCS bhavcopy backfill (the scalable OI-history seed).
 *
 * Triggers the deployed `/api/cron/oi-history?cache=1` endpoint so the NSE fetch
 * runs server-side (proxied egress + GCS write access). One fetch per DATE caches
 * every index + stock at once, so ~120 days ≈ ~120 NSE calls total — independent
 * of symbol count.
 *
 * After this runs, opening any symbol's History materializes its per-symbol doc
 * from the cached snapshots (no NSE).
 *
 * Usage:
 *   APP_BASE_URL=https://…hosted.app CRON_SECRET=xxx \
 *     npx tsx scripts/cache-bhavcopy.ts [tradingDays]
 *
 *   tradingDays  optional (default 120)
 */

export {}; // module scope

const CHUNK = 15; // trading days per request — keep under the 120s function limit

async function main(): Promise<void> {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.CRON_SECRET;
  const targetDays = Number(process.argv[2] ?? 120) || 120;

  if (!base) {
    console.error("Set APP_BASE_URL (e.g. https://…hosted.app).");
    process.exit(1);
  }
  if (!key) {
    console.error("Set CRON_SECRET (matches the deployed env).");
    process.exit(1);
  }

  console.log(`Caching ~${targetDays} trading days of bhavcopy into GCS on ${base} …`);

  let remaining = targetDays;
  let before: string | null = null;
  let total = 0;

  while (remaining > 0) {
    const chunk = Math.min(CHUNK, remaining);
    const url = new URL(`${base}/api/cron/oi-history`);
    url.searchParams.set("cache", "1");
    url.searchParams.set("days", String(chunk));
    if (before) url.searchParams.set("before", before);
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      added?: number;
      alreadyCached?: number;
      holidaysSkipped?: number;
      earliestDate?: string | null;
      error?: string;
    };

    if (!res.ok || json.success === false) {
      console.error(`Chunk failed (HTTP ${res.status}): ${json.error ?? "unknown"}`);
      process.exit(1);
    }

    const added = json.added ?? 0;
    const already = json.alreadyCached ?? 0;
    const advanced = added + already;
    total += added;
    console.log(
      `  +${added} new (${already} already, ${json.holidaysSkipped ?? 0} holidays), earliest ${json.earliestDate ?? "?"}`,
    );

    if (advanced === 0 || !json.earliestDate) {
      console.log("Reached start of available archives — stopping.");
      break;
    }

    const prev = new Date(`${json.earliestDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    before = prev.toISOString().slice(0, 10);
    remaining -= advanced;
  }

  console.log(`Done. Cached ~${total} new trading days into GCS.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
