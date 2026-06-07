/**
 * One-time India VIX history backfill.
 *
 * Seeds `config/india_vix_state` with ~1 year of NSE India VIX closes so the
 * volatility-regime percentile is meaningful immediately, instead of after ~20
 * daily snapshots accrue.
 *
 * It triggers the deployed `/api/cron/vol-regime?backfillVix=1` endpoint so the
 * actual NSE fetch runs server-side (where NSE is reachable / proxied and admin
 * credentials exist) — running the fetch from a laptop usually hits NSE's geo
 * block.
 *
 * Usage:
 *   APP_BASE_URL=https://tezterminal.com CRON_SECRET=xxx \
 *     npx tsx scripts/backfill-india-vix.ts [days]
 *
 * `days` is optional (default 365, clamped 30–2000 server-side).
 */

async function main(): Promise<void> {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.CRON_SECRET;
  const days = Number(process.argv[2] ?? 365) || 365;

  if (!base) {
    console.error("Set APP_BASE_URL (e.g. https://tezterminal.com).");
    process.exit(1);
  }
  if (!key) {
    console.error("Set CRON_SECRET (matches the deployed env).");
    process.exit(1);
  }

  const url = `${base}/api/cron/vol-regime?backfillVix=1&days=${days}&key=${encodeURIComponent(key)}`;
  console.log(`Triggering India VIX backfill (${days}d) on ${base} …`);

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok || (json as { success?: boolean }).success === false) {
    console.error(`Backfill failed (HTTP ${res.status}).`);
    process.exit(1);
  }
  console.log("Backfill done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
