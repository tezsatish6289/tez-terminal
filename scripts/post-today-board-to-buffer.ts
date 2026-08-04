/**
 * One-shot / local test for the morning levels Buffer post.
 *
 * Preferred production path: cron
 *   GET /api/cron/today-board-buffer?key=CRON_SECRET
 *   (Mon–Fri 08:00 IST)
 *
 * Local:
 *   npx tsx --env-file=.env.local scripts/post-today-board-to-buffer.ts
 *   npx tsx --env-file=.env.local scripts/post-today-board-to-buffer.ts --from-firebase
 *
 * Note: uses contentId today-board-{day}-manual so it won't block the daily cron.
 */
import { execSync } from "node:child_process";

function loadFromFirebase(name: string): string {
  return execSync(`firebase apphosting:secrets:access ${name}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function main() {
  if (process.argv.includes("--from-firebase")) {
    process.env.BUFFER_API_KEY = loadFromFirebase("BUFFER_API_KEY");
    console.log("Loaded BUFFER_API_KEY from Firebase App Hosting secrets.\n");
  }
  if (!process.env.BUFFER_API_KEY?.trim()) {
    console.error("Missing BUFFER_API_KEY. Use --env-file=.env.local or --from-firebase.");
    process.exit(1);
  }

  const { buildTodayBoardCaptions, TODAY_BOARD_PUBLIC_URL } = await import(
    "../src/lib/fnoninja/today-board-captions"
  );
  const { formatBoardPrice } = await import("../src/lib/fnoninja/today-board-shared");
  const { FNONINJA_SITE_URL } = await import("../src/lib/fnoninja/metadata");
  const { createBufferPost, listChannels } = await import("../src/lib/social/buffer");
  const {
    clampCaption,
    normalizeCaption,
    platformForBufferService,
    getPlatform,
  } = await import("../src/lib/social/platforms");

  // today-board.ts is server-only — for local script, fetch via public API instead.
  const res = await fetch(`${FNONINJA_SITE_URL}/api/freedombot/levels`, { cache: "no-store" });
  if (!res.ok) throw new Error(`levels API HTTP ${res.status}`);
  const json = (await res.json()) as {
    indices?: { symbol?: string; data?: Record<string, unknown> | null }[];
  };

  const board = {
    indices: (["NIFTY", "BANKNIFTY"] as const).map((symbol) => {
      const hit = json.indices?.find((it) => (it.symbol ?? "").toUpperCase() === symbol);
      const d = hit?.data ?? {};
      return {
        symbol,
        label: symbol === "BANKNIFTY" ? "Bank Nifty" : "Nifty",
        spot: typeof d.spot === "number" ? d.spot : null,
        putWall: typeof d.putClusterStrike === "number" ? d.putClusterStrike : null,
        callWall: typeof d.callClusterStrike === "number" ? d.callClusterStrike : null,
        maxPain: typeof d.poc === "number" ? d.poc : null,
        putOi: typeof d.putClusterSize === "number" ? d.putClusterSize : null,
        callOi: typeof d.callClusterSize === "number" ? d.callClusterSize : null,
        expiry: typeof d.zonesExpiry === "string" ? d.zonesExpiry : null,
        computedAt: typeof d.computedAt === "string" ? d.computedAt : null,
      };
    }),
    updatedAt: null as string | null,
  };

  console.log("Loading live walls…");
  for (const row of board.indices) {
    console.log(
      `  ${row.label}: spot ${formatBoardPrice(row.spot)} · put ${formatBoardPrice(row.putWall)} · call ${formatBoardPrice(row.callWall)} · max pain ${formatBoardPrice(row.maxPain)}`,
    );
  }

  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const imageUrl = `${FNONINJA_SITE_URL}/today/opengraph-image?d=${dayKey}`;

  const og = await fetch(imageUrl, { cache: "no-store" });
  if (!og.ok) {
    console.error(`OG image not ready (HTTP ${og.status}): ${imageUrl}`);
    process.exit(1);
  }
  console.log(`\nOG image OK → ${imageUrl}`);
  console.log(`Board URL → ${TODAY_BOARD_PUBLIC_URL}`);

  const captions = buildTodayBoardCaptions(board);
  console.log("\n── Captions ──\n");
  for (const [k, v] of Object.entries(captions)) {
    console.log(`[${k}]\n${v}\n`);
  }

  const platforms = ["twitter", "facebook", "linkedin", "instagram"] as const;
  const channels = await listChannels();
  const channelMap = new Map<string, string>();
  for (const ch of channels) {
    const platform = platformForBufferService(ch.service);
    if (platform && !channelMap.has(platform)) channelMap.set(platform, ch.id);
  }

  console.log("Posting to Buffer (shareNow)…\n");
  let anyOk = false;
  for (const platform of platforms) {
    const def = getPlatform(platform);
    const channelId = channelMap.get(platform);
    const raw = captions[platform];
    if (!def || !channelId || !raw) {
      console.log(`  · ${platform.padEnd(10)} skipped`);
      continue;
    }
    const text = clampCaption(normalizeCaption(raw), def.postBudget);
    try {
      const { postId } = await createBufferPost({
        channelId,
        network: platform,
        text,
        imageUrl,
        mode: "shareNow",
      });
      anyOk = true;
      console.log(`  ✓ ${platform.padEnd(10)} posted  post=${postId}`);
    } catch (e) {
      console.log(`  ✗ ${platform.padEnd(10)} ${(e as Error).message}`);
    }
  }

  if (!anyOk) process.exit(1);
  console.log("\nDone. Cron path: /api/cron/today-board-buffer?key=CRON_SECRET");
}

main().catch((err: unknown) => {
  console.error("\nFailed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
