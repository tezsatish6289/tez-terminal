/**
 * Close orphaned OPEN live mirrors (sim missing or CLOSED).
 *
 *   npx tsx --env-file=.env.local scripts/close-live-mirrors.ts \
 *     --symbol XRP --side SELL --dry
 *
 *   npx tsx --env-file=.env.local scripts/close-live-mirrors.ts \
 *     --symbol XRP --side SELL
 */
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const simTradeId = args.includes("--sim-trade-id")
    ? args[args.indexOf("--sim-trade-id") + 1]
    : undefined;
  const symbol = args.includes("--symbol") ? args[args.indexOf("--symbol") + 1] : undefined;
  const side = args.includes("--side") ? args[args.indexOf("--side") + 1] : undefined;

  if (!simTradeId && !symbol) {
    console.error(
      "Usage: close-live-mirrors.ts (--sim-trade-id <id> | --symbol XRP [--side SELL]) [--dry]",
    );
    process.exit(1);
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET not set");
    process.exit(1);
  }

  const base = (process.env.APP_BASE_URL ?? "https://tezterminal.com").replace(/\/$/, "");
  const params = new URLSearchParams({ key: cronSecret, action: "closeOrphanLive" });
  if (dry) params.set("dry", "true");
  if (simTradeId) params.set("simTradeId", simTradeId);
  if (symbol) params.set("symbol", symbol);
  if (side) params.set("side", side);

  const url = `${base}/api/admin/delete-trades?${params.toString()}`;
  console.log(dry ? "Preview:" : "Closing orphans:", url.replace(cronSecret, "***"));

  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    console.error("Non-JSON response:", body.slice(0, 500));
    process.exit(1);
  }

  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
