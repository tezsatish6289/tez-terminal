/**
 * Self-cleaning end-to-end test of the webinar provisioning paths.
 *
 * Actually creates a Calendar event and a YouTube scheduled broadcast on the
 * authorized account, prints their links, then DELETES both so nothing is left
 * behind. No guest is added (so no emails are sent).
 *
 * Usage:
 *   npx tsx scripts/test-webinar-provision.ts --from-firebase
 */
import { execSync } from "node:child_process";

function loadFromFirebase(name: string): string {
  return execSync(`firebase apphosting:secrets:access ${name}`, { encoding: "utf8" }).trim();
}

async function main() {
  if (process.argv.includes("--from-firebase")) {
    process.env.GOOGLE_OAUTH_CLIENT_ID = loadFromFirebase("GOOGLE_OAUTH_CLIENT_ID");
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = loadFromFirebase("GOOGLE_OAUTH_CLIENT_SECRET");
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = loadFromFirebase("GOOGLE_OAUTH_REFRESH_TOKEN");
    console.log("Loaded credentials from Firebase.\n");
  }

  const { getGoogleAccessToken, googleDelete } = await import("../src/lib/google/oauth");
  const { createWebinarCalendarEvent } = await import("../src/lib/google/calendar");
  const { createScheduledBroadcast } = await import("../src/lib/google/youtube");
  const { getNextWebinarSession } = await import("../src/lib/fnoninja/webinar");

  const token = await getGoogleAccessToken();
  const session = getNextWebinarSession();
  console.log(`Next session: ${session.istDate} (${session.start.toISOString()})\n`);

  // ── Calendar ──────────────────────────────────────────────
  console.log("Creating Calendar event…");
  const ev = await createWebinarCalendarEvent(token, session);
  console.log(`  ✓ created: ${ev.id}`);
  if (ev.htmlLink) console.log(`    ${ev.htmlLink}`);
  await googleDelete(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.id)}`,
  );
  console.log("  ✓ deleted (cleanup)\n");

  // ── YouTube ───────────────────────────────────────────────
  console.log("Creating YouTube scheduled broadcast…");
  const b = await createScheduledBroadcast(token, session);
  console.log(`  ✓ created: ${b.id}`);
  console.log(`    ${b.watchUrl}`);
  await googleDelete(token, `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${b.id}`);
  console.log("  ✓ deleted (cleanup)\n");

  console.log("All provisioning paths work end-to-end. ✅");
}

main().catch((err: unknown) => {
  console.error("\n✗ Provision test failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
