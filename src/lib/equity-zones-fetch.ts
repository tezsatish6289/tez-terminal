/**
 * Shared NSE → Dhan fallback for single-stock zone fetches (cron + on-demand).
 */

import "server-only";

import type { NseSession } from "@/lib/nse/client";
import { NseBlockError, NseCircuitOpenError } from "@/lib/nse/types";
import { computeEquityZones, type EquityRegimeInputs } from "@/lib/equity-options-zones";
import { computeEquityZonesDhan } from "@/lib/equity-options-zones-dhan";

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function nseFallbackEligible(err: unknown): boolean {
  if (err instanceof NseBlockError || err instanceof NseCircuitOpenError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("nse circuit") ||
      m.includes("nse empty") ||
      m.includes("nse non_json") ||
      m.includes("session not established") ||
      m.includes("rate limiter")
    );
  }
  return false;
}

export async function computeStockZonesWithFallback(
  symbol: string,
  session: NseSession | null,
  regimeInputs: EquityRegimeInputs = {},
): Promise<{
  zones: Awaited<ReturnType<typeof computeEquityZones>>;
  source: "nse_equity" | "dhan_equity";
}> {
  const preferDhan = envBool("STOCK_ZONES_DHAN_PRIMARY", false);

  if (!preferDhan && session) {
    try {
      const zones = await computeEquityZones(symbol, session, regimeInputs);
      return { zones, source: "nse_equity" };
    } catch (e) {
      if (!nseFallbackEligible(e)) throw e;
    }
  }

  const zones = await computeEquityZonesDhan(symbol, regimeInputs);
  return { zones, source: "dhan_equity" };
}
