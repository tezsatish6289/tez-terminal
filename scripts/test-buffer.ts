/**
 * Verify the Buffer API key and show how connected channels map to our platforms.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-buffer.ts
 *
 * Or load the key from Firebase App Hosting secrets (requires firebase login):
 *   npx tsx scripts/test-buffer.ts --from-firebase
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
    console.error("Missing BUFFER_API_KEY. Add it to .env.local or run with --from-firebase.");
    process.exit(1);
  }

  console.log("Testing Buffer API key…\n");

  const { getOrganizationId, listChannels } = await import("../src/lib/social/buffer");
  const { platformForBufferService, SOCIAL_PLATFORMS } = await import("../src/lib/social/platforms");

  const orgId = await getOrganizationId();
  console.log(`✓ Authenticated. Organization: ${orgId}\n`);

  const channels = await listChannels();
  if (channels.length === 0) {
    console.error("✗ No channels connected in Buffer. Connect X / IG / FB / LinkedIn / YouTube first.");
    process.exit(1);
  }

  console.log(`Connected channels (${channels.length}):`);
  const mapped = new Set<string>();
  for (const ch of channels) {
    const platform = platformForBufferService(ch.service);
    if (platform) mapped.add(platform);
    const tag = platform ? `→ ${platform}` : "→ (unmapped)";
    console.log(`  • ${ch.name}  [${ch.service}]  ${tag}`);
  }

  console.log("\nOur platform coverage:");
  for (const p of SOCIAL_PLATFORMS) {
    console.log(`  ${mapped.has(p.id) ? "✓" : "✗"} ${p.label}`);
  }

  const missing = SOCIAL_PLATFORMS.filter((p) => !mapped.has(p.id));
  if (missing.length > 0) {
    console.log(`\nNote: ${missing.map((p) => p.label).join(", ")} not detected — connect them in Buffer if you want them.`);
  }
  console.log("\nAll good — the Schedule-to-Buffer panel will use these channels.");
}

main().catch((err: unknown) => {
  console.error("\n✗ Buffer test failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
