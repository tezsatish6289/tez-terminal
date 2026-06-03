/**
 * /api/freedombot/levels
 *
 * Public read for the freedombot.ai/levels page. Returns the latest
 * algorithmically-derived bull/bear zones for:
 *   • NSE indices  → config/suggested_index_zones_{SYMBOL}  (suggest-zones cron, NSE pass)
 *   • Crypto       → config/suggested_zones_{asset}         (suggest-zones cron, Deribit pass)
 *   • NSE stocks   → config/suggested_stock_zones_{SYMBOL}  (suggest-stock-zones cron)
 *
 * Modes:
 *   • GET (no params)        → { indices, crypto, stocks (compact), inZone, updatedAt }
 *   • GET ?symbol=RELIANCE   → { symbol, label, data } single stock's full ladder payload
 *
 * IMPORTANT: the stored docs carry the full derivation (strikes, OI, max-pain by
 * expiry, cluster shares, IV, source, …). We deliberately do NOT return them raw —
 * each doc is projected to a neutral, render-only payload (`PublicLevels`) so the
 * methodology never reaches the browser/network tab. Only the fields the public
 * ladder draws are exposed, under neutral key names.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-options-zones";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  deriveZoneStatus,
  isInZoneStatus,
  type ZoneStatus,
} from "@/lib/zones/zone-status";
import {
  computeStockZonesOnDemand,
  isValidFnoSymbol,
  normalizeStockSymbol,
  stockLevelsCacheFresh,
  stockLevelsLadderComplete,
} from "@/lib/equity-zones-on-demand";
import { stockDocId } from "@/lib/equity-zones-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** On-demand NSE fetch for a single stock can take ~10–15s. */
export const maxDuration = 60;

const CRYPTO: { asset: string; label: string }[] = [
  { asset: "btc", label: "Bitcoin" },
  { asset: "eth", label: "Ethereum" },
  { asset: "sol", label: "Solana" },
  { asset: "xrp", label: "XRP" },
];

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(raw: unknown): boolean | null {
  return raw === true ? true : raw === false ? false : null;
}

/** Strip the stored doc down to the neutral fields the public ladder renders. */
function sanitize(raw: Record<string, unknown> | null): PublicLevels | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    poc: num(raw.maxPain),
    bullLow: num(raw.bullZoneLow),
    bullHigh: num(raw.bullZoneHigh),
    bearLow: num(raw.bearZoneLow),
    bearHigh: num(raw.bearZoneHigh),
    bandOffset: num(raw.halfWidthUsd),
    bullActive: bool(raw.bullActionable),
    bearActive: bool(raw.bearActionable),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
    unavailable: typeof raw.nseFetchError === "string" && raw.nseFetchError !== "",
  };
}

/** Status from a sanitized payload (for the In-Zone aggregation). */
function statusOf(data: PublicLevels | null): ZoneStatus {
  if (!data) return "ILLIQUID";
  return deriveZoneStatus({
    spot: data.spot,
    bullLow: data.bullLow,
    bullHigh: data.bullHigh,
    bearLow: data.bearLow,
    bearHigh: data.bearHigh,
  });
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Scope = "index" | "crypto" | "stock";

interface InZoneItem {
  scope: Scope;
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  currency: "₹" | "$";
  /** Sanitized ladder payload for the In-Zone slideshow (no extra fetch). */
  data: PublicLevels | null;
}

interface StockAggregateEntry {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
  halfWidth?: number | null;
  computedAt?: string;
}

/** Build a render-safe ladder from the stock aggregate row (bands + POC when present). */
function levelsFromStockAggregate(e: StockAggregateEntry): PublicLevels | null {
  const bullLow = num(e.bullZoneLow);
  const bearLow = num(e.bearZoneLow);
  if (bullLow == null && bearLow == null) return null;
  return {
    spot: num(e.spot),
    poc: num(e.maxPain),
    bullLow,
    bullHigh: num(e.bullZoneHigh),
    bearLow,
    bearHigh: num(e.bearZoneHigh),
    bandOffset: num(e.halfWidth),
    bullActive: null,
    bearActive: null,
    computedAt: typeof e.computedAt === "string" ? e.computedAt : null,
    unavailable: false,
  };
}

/**
 * Single-stock ladder payload. Reads Firestore first; if missing, stale, or
 * without bands, runs an on-demand NSE compute (the planned click-to-fetch path).
 */
async function getSingleStock(symbol: string, forceRefresh: boolean) {
  const safe = normalizeStockSymbol(symbol);
  if (!isValidFnoSymbol(safe)) {
    return NextResponse.json({ error: "Unknown F&O symbol" }, { status: 400 });
  }

  let raw = await readDoc(stockDocId(safe));
  let data = sanitize(raw);
  const cachedFresh = stockLevelsCacheFresh(data?.computedAt) && stockLevelsLadderComplete(data);

  if (forceRefresh || !cachedFresh) {
    const result = await computeStockZonesOnDemand(safe);
    raw = await readDoc(stockDocId(safe));
    data = sanitize(raw);
    if (!stockLevelsLadderComplete(data)) {
      return NextResponse.json(
        {
          symbol: safe,
          label: (typeof raw?.label === "string" && raw.label) || safe,
          data,
          source: "nse",
          computed: result.ok,
          error: result.error ?? (data?.unavailable ? "Levels unavailable for this symbol" : "No bands derived"),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        symbol: safe,
        label: (typeof raw?.label === "string" && raw.label) || safe,
        data,
        source: "nse",
        computed: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const label = (typeof raw?.label === "string" && raw.label) || safe;
  return NextResponse.json(
    { symbol: safe, label, data, source: "cache", computed: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol");
  if (symbol) {
    const forceRefresh = params.get("refresh") === "1" || params.get("compute") === "1";
    return getSingleStock(symbol, forceRefresh);
  }

  const [indexDocs, cryptoDocs, stockAgg] = await Promise.all([
    Promise.all(INDEX_KEYS.map((k) => readDoc(`config/suggested_index_zones_${k}`))),
    Promise.all(CRYPTO.map((c) => readDoc(`config/suggested_zones_${c.asset}`))),
    readDoc(STOCK_AGGREGATE_DOC),
  ]);

  const indices = INDEX_KEYS.map((k, i) => ({
    symbol: k,
    label: INDEX_SPECS[k].label,
    data: sanitize(indexDocs[i]),
  }));

  const crypto = CRYPTO.map((c, i) => ({
    asset: c.asset,
    label: c.label,
    data: sanitize(cryptoDocs[i]),
  }));

  // Compact stock list (from the aggregate doc — one read, not N).
  const stockEntries = (stockAgg?.entries ?? {}) as Record<string, StockAggregateEntry>;
  const stocks = Object.values(stockEntries)
    .filter((e) => e && typeof e.symbol === "string")
    .map((e) => ({
      symbol: e.symbol,
      label: e.label ?? e.symbol,
      status: e.status,
      spot: e.spot ?? null,
      maxPain: num(e.maxPain),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  // ── Cross-tab In-Zone aggregation ──────────────────────────────
  const inZone: InZoneItem[] = [];

  for (const it of indices) {
    const status = statusOf(it.data);
    if (isInZoneStatus(status)) {
      inZone.push({
        scope: "index",
        symbol: it.symbol,
        label: it.label,
        status,
        spot: it.data?.spot ?? null,
        currency: "₹",
        data: it.data,
      });
    }
  }
  for (const it of crypto) {
    const status = statusOf(it.data);
    if (isInZoneStatus(status)) {
      inZone.push({
        scope: "crypto",
        symbol: it.asset,
        label: it.label,
        status,
        spot: it.data?.spot ?? null,
        currency: "$",
        data: it.data,
      });
    }
  }
  for (const e of Object.values(stockEntries)) {
    if (e && isInZoneStatus(e.status)) {
      inZone.push({
        scope: "stock",
        symbol: e.symbol,
        label: e.label ?? e.symbol,
        status: e.status,
        spot: e.spot ?? null,
        currency: "₹",
        data: levelsFromStockAggregate(e),
      });
    }
  }

  inZone.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  return NextResponse.json(
    { indices, crypto, stocks, inZone, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
