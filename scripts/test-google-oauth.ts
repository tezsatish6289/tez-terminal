/**
 * Verify Google OAuth credentials (YouTube + Calendar scopes).
 *
 * Usage (env vars):
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... GOOGLE_OAUTH_REFRESH_TOKEN=... \
 *     npx tsx scripts/test-google-oauth.ts
 *
 * Or load from Firebase App Hosting secrets (requires firebase login):
 *   npx tsx scripts/test-google-oauth.ts --from-firebase
 */
import { execSync } from "node:child_process";

function loadFromFirebase(name: string): string {
  return execSync(`firebase apphosting:secrets:access ${name}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function main() {
  const fromFirebase = process.argv.includes("--from-firebase");

  if (fromFirebase) {
    process.env.GOOGLE_OAUTH_CLIENT_ID = loadFromFirebase("GOOGLE_OAUTH_CLIENT_ID");
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = loadFromFirebase("GOOGLE_OAUTH_CLIENT_SECRET");
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = loadFromFirebase("GOOGLE_OAUTH_REFRESH_TOKEN");
    console.log("Loaded credentials from Firebase App Hosting secrets.\n");
  }

  const missing = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"].filter(
    (k) => !process.env[k]?.trim(),
  );
  if (missing.length > 0) {
    console.error(`Missing env: ${missing.join(", ")}`);
    console.error("Run with --from-firebase or set env vars locally.");
    process.exit(1);
  }

  console.log("Testing Google OAuth refresh token…\n");

  const { getGoogleAccessToken, fetchYouTubeChannel, verifyCalendarEventsAccess, getGoogleOAuthConfig } =
    await import("../src/lib/google/oauth");

  const cfg = getGoogleOAuthConfig()!;
  const accessToken = await getGoogleAccessToken(cfg);
  console.log("✓ Token refresh OK\n");

  try {
    const youtube = await fetchYouTubeChannel(accessToken);
    if (!youtube) throw new Error("no channel returned");
    console.log(`✓ YouTube channel: ${youtube.title} (${youtube.id})`);
  } catch (err) {
    console.error("✗ YouTube API failed:", err instanceof Error ? err.message : err);
    console.error("  → Re-authorize with scope: https://www.googleapis.com/auth/youtube.force-ssl");
    process.exit(1);
  }

  try {
    await verifyCalendarEventsAccess(accessToken);
    console.log("✓ Calendar events access OK (can create events + add guests on primary calendar)");
  } catch (err) {
    console.error("✗ Calendar API failed:", err instanceof Error ? err.message : err);
    console.error("  → Re-authorize with scope: https://www.googleapis.com/auth/calendar.events");
    process.exit(1);
  }

  console.log("\nAll checks passed — credentials are valid for YouTube + Calendar integration.");
}

main().catch((err: unknown) => {
  console.error("\n✗ OAuth test failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
