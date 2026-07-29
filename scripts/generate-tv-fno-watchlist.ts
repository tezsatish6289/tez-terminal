/**
 * Generate TradingView NSE F&O watchlist .txt files.
 *
 * Usage:
 *   npm run watchlist:generate:fno
 *   npx tsx --env-file=.env.local scripts/generate-tv-fno-watchlist.ts
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

// Next's `server-only` package isn't resolvable from plain tsx — stub it.
const stubPath = path.join(__dirname, "stubs", "server-only.js");
const mod = Module as typeof Module & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
    options?: unknown,
  ) => string;
};
const origResolve = mod._resolveFilename;
mod._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") return stubPath;
  return origResolve.call(this, request, parent, isMain, options);
};

const OUT_DIR = path.join(process.cwd(), "output", "watchlists");

async function main() {
  const { buildFnoWatchlists } = await import("../src/lib/watchlist/build-fno-watchlists");

  console.log("Ideal Watchlist — NSE F&O generator\n");

  const data = await buildFnoWatchlists(true);
  console.log(
    `Source: ${data.source} · ${data.indexCount} indices + ${data.stockCount} stocks\n`,
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const list of data.lists) {
    const parts = data.downloads[list.id];
    parts.forEach((content, i) => {
      const suffix = parts.length > 1 ? `-part${i + 1}` : "";
      const filename = `tez-fno-${list.id}${suffix}-nse-tv.txt`;
      const filepath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filepath, content, "utf8");
      const symbolCount = content ? content.split(",").length : 0;
      console.log(`Wrote ${filepath} (${symbolCount} symbols)`);
    });
    console.log(`  ${list.label}: ${list.count} symbols, ${list.tradingViewParts} TV file(s)`);
  }

  const manifestPath = path.join(OUT_DIR, "fno-manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: data.generatedAt,
        source: data.source,
        indexCount: data.indexCount,
        stockCount: data.stockCount,
        lists: data.lists,
        sample: data.rows.slice(0, 10).map((r) => r.tradingView),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
