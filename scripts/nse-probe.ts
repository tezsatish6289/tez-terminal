/**
 * One-off NSE connectivity probe (run: npx tsx scripts/nse-probe.ts).
 * Does not touch Firestore.
 */

import { getNseCookies, API_HEADERS } from "../src/lib/nse-session";
import { nseFetch } from "../src/lib/nse-fetch";
import { classifyNseBody } from "../src/lib/nse/types";

const PROBE_SYMBOLS = ["RELIANCE", "ESCORTS", "NIFTY"] as const;

async function probeUrl(label: string, url: string, cookies: string): Promise<void> {
  const res = await nseFetch(url, {
    headers: { ...API_HEADERS, Cookie: cookies },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  const kind = classifyNseBody(res.status, body);
  const preview = body.trim().slice(0, 120).replace(/\s+/g, " ");
  console.log(`\n[${label}]`);
  console.log(`  HTTP ${res.status} → ${kind}`);
  console.log(`  body preview: ${preview || "(empty)"}`);
  console.log(`  body length: ${body.length}`);
}

async function main(): Promise<void> {
  const proxy = process.env.NSE_HTTPS_PROXY?.trim() || process.env.HTTPS_PROXY?.trim() || "(none)";
  console.log(`NSE_HTTPS_PROXY: ${proxy}`);

  console.log("\n=== Cookie bootstrap ===");
  const cookies = await getNseCookies();
  console.log(`  cookie length: ${cookies.length}`);
  console.log(`  has cookies: ${cookies.trim().length > 0}`);

  if (!cookies.trim()) {
    console.log("\nDIAGNOSIS: No cookies — session bootstrap failed (likely geo/WAF).");
    process.exit(1);
  }

  for (const sym of PROBE_SYMBOLS) {
    const type = sym === "NIFTY" ? "Indices" : "Equities";
    await probeUrl(
      `${sym} contract-info`,
      `https://www.nseindia.com/api/option-chain-contract-info?symbol=${encodeURIComponent(sym)}`,
      cookies,
    );
    if (sym !== "NIFTY") {
      await probeUrl(
        `${sym} option-chain-v3`,
        `https://www.nseindia.com/api/option-chain-v3?type=${type}&symbol=${encodeURIComponent(sym)}`,
        cookies,
      );
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Probe failed:", e);
  process.exit(1);
});
