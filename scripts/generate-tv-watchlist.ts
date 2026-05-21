/**
 * Generate TradingView watchlist .txt files from live exchange instrument APIs.
 *
 * Exchanges covered: see WATCHLIST_VENUES in src/lib/watchlist/venues.ts
 *
 * Usage:
 *   npm run watchlist:generate
 *   npx tsx scripts/generate-tv-watchlist.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildWatchlists } from "../src/lib/watchlist/build-watchlists";
import { getActiveWatchlistVenueKeys, WATCHLIST_VENUES } from "../src/lib/watchlist/venues";

const OUT_DIR = path.join(process.cwd(), "output", "watchlists");

async function main() {
  console.log("Ideal Watchlist generator\n");
  console.log("Exchanges covered (edit src/lib/watchlist/venues.ts when you add venues):\n");
  for (const v of WATCHLIST_VENUES) {
    const tag = v.status === "active" ? "ACTIVE" : "PLANNED";
    console.log(`  [${tag}] ${v.key} — ${v.label}${v.notes ? ` (${v.notes})` : ""}`);
  }
  console.log(`\nActive for Core intersection: ${getActiveWatchlistVenueKeys().join(", ")}\n`);

  const data = await buildWatchlists(true);

  if (Object.keys(data.venueErrors).length > 0) {
    console.warn("Venue fetch errors:");
    for (const [k, err] of Object.entries(data.venueErrors)) {
      console.warn(`  ${k}: ${err}`);
    }
    console.log();
  }

  for (const [key, count] of Object.entries(data.venueCounts)) {
    console.log(`  ${key}: ${count} USDT perps (canonical)`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const list of data.lists) {
    const parts = data.downloads[list.id];
    parts.forEach((content, i) => {
      const suffix = parts.length > 1 ? `-part${i + 1}` : "";
      const filename = `tez-${list.id}${suffix}-bybit-tv.txt`;
      const filepath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filepath, content, "utf8");
      const symbolCount = content ? content.split(",").length : 0;
      console.log(`Wrote ${filepath} (${symbolCount} symbols)`);
    });
    console.log(`  ${list.label}: ${list.count} symbols, ${list.tradingViewParts} TV file(s)`);
  }

  const manifest = {
    generatedAt: data.generatedAt,
    venues: data.venues,
    activeVenueKeys: data.activeVenueKeys,
    venueCounts: data.venueCounts,
    lists: data.lists,
    coreSymbols: data.rows.filter((r) => r.inCore).map((r) => r.symbol),
  };
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nWrote ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
