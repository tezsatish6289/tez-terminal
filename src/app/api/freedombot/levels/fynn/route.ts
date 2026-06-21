/**
 * POST /api/freedombot/levels/fynn
 *
 * Fynn — F&O strategy coach. Reads the stored zone doc for {scope, symbol}
 * server-side (full derivation: max pain, OI walls, strikes, IV), builds a
 * compact context and asks the Fynn Genkit flow for a structured strategy plan.
 *
 * The raw option chain never leaves the server: only the same derived levels
 * the public chart already draws are sent to the model, and only Fynn's
 * reasoned plan is returned to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { stockDocId } from "@/lib/equity-zones-store";
import { normalizeStockSymbol } from "@/lib/equity-zones-on-demand";
import { isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import { generateFynnPlan, type FynnContext } from "@/ai/flows/fynn-strategy-flow";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** LLM call; allow generous headroom. */
export const maxDuration = 45;

export const FYNN_DISCLAIMER =
  "Fynn is an educational strategy assistant, not investment advice. Options carry risk of loss. Do your own research.";

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round(n: number | null): number | null {
  if (n == null) return null;
  return n >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildContext(
  scope: "stock" | "index",
  symbol: string,
  raw: Record<string, unknown>,
): FynnContext {
  const label = (typeof raw.label === "string" && raw.label) || symbol;
  return {
    symbol,
    label,
    scope,
    currency: "₹",
    spot: round(num(raw.deribitIndexPrice) ?? num(raw.btcPrice)),
    maxPain: round(num(raw.maxPain)),
    supportLow: round(num(raw.bullZoneLow)),
    supportHigh: round(num(raw.bullZoneHigh)),
    resistanceLow: round(num(raw.bearZoneLow)),
    resistanceHigh: round(num(raw.bearZoneHigh)),
    putWallStrike: round(num(raw.bullStrike)),
    putWallSize: num(raw.bullOI),
    callWallStrike: round(num(raw.bearStrike)),
    callWallSize: num(raw.bearOI),
    atmIV: round(num(raw.atmIV)),
    volRegime: typeof raw.volRegimeFlag === "string" ? raw.volRegimeFlag : null,
    volRegimeReason:
      typeof raw.volRegimeReason === "string" ? raw.volRegimeReason : null,
    daysToEarnings: num(raw.daysToEarnings),
    expiry: resolveZonesExpiryFromStored(raw),
  };
}

export async function POST(request: NextRequest) {
  let body: { scope?: string; symbol?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scope = body.scope === "index" ? "index" : body.scope === "stock" ? "stock" : null;
  const rawSymbol = (body.symbol ?? "").trim().toUpperCase();
  if (!scope || !rawSymbol) {
    return NextResponse.json({ error: "Missing scope or symbol" }, { status: 400 });
  }

  const db = getAdminFirestore();
  let docPath: string;
  let symbol = rawSymbol;

  if (scope === "stock") {
    symbol = normalizeStockSymbol(rawSymbol);
    if (!(await isValidFnoSymbolDb(db, symbol))) {
      return NextResponse.json({ error: "Unknown F&O symbol" }, { status: 400 });
    }
    docPath = stockDocId(symbol);
  } else {
    docPath = `config/suggested_index_zones_${symbol}`;
  }

  const raw = await readDoc(docPath);
  if (!raw) {
    return NextResponse.json(
      { error: "No levels available for this symbol yet. Open the chart to compute zones first." },
      { status: 404 },
    );
  }

  const context = buildContext(scope, symbol, raw);
  if (context.spot == null && context.maxPain == null) {
    return NextResponse.json(
      { error: "Levels are still being computed for this symbol. Try again shortly." },
      { status: 409 },
    );
  }

  try {
    const plan = await generateFynnPlan(context);
    return NextResponse.json(
      { symbol, label: context.label, plan, disclaimer: FYNN_DISCLAIMER },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Fynn]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Fynn could not put together a plan right now. Please try again." },
      { status: 500 },
    );
  }
}
