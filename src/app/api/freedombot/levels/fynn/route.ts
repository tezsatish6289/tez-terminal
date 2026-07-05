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
import {
  type FynnContext,
  type FynnMode,
  type FynnPlan,
} from "@/ai/flows/fynn-strategy-flow";
import { getFynnPlan } from "@/lib/levels/fynn-plan-cache";
import { blackScholesPrice } from "@/lib/options/black-scholes";
import {
  computeStrategyEconomics,
  strategyPayoffAt,
  type StrategyEconomics,
  type StrategyLeg,
} from "@/lib/options/strategy-economics";
import { loadIvHistory } from "@/lib/iv-history";
import { ivPercentile } from "@/lib/zones/vol-regime";
import { fetchPvtSlope } from "@/lib/levels/pvt-signal";
import {
  computeDirection,
  postureFromLegs,
  scoreStrategy,
  type ScoreInputs,
  type SetupScore,
} from "@/lib/levels/strategy-score";
import { scoreInputsFromFynnContext } from "@/lib/levels/strategy-score-adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** LLM call; allow generous headroom. */
export const maxDuration = 45;

export const FYNN_DISCLAIMER =
  "Fynn is an educational strategy assistant, not investment advice. Options carry risk of loss. Do your own research.";

const FYNN_FUTURES_DISCLAIMER =
  "Fynn is an educational strategy assistant, not investment advice. Futures use leverage and can lose more than the premium; the hedge only caps risk if held. Do your own research.";

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

/** Day-over-day % change at a wall from its current OI + absolute contract delta. */
function oiChangePct(oi: number | null, change: number | null): number | null {
  if (oi == null || change == null) return null;
  const prior = oi - change;
  if (prior <= 0) return null;
  return Math.round((change / prior) * 1000) / 10;
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parse a DD/MM/YYYY expiry to calendar days from now (null if unparseable). */
function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const m = expiry.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const target = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - startOfToday.getTime();
  return Math.round(diffMs / 86_400_000);
}

function buildContext(
  scope: "stock" | "index",
  symbol: string,
  mode: FynnMode,
  raw: Record<string, unknown>,
): FynnContext {
  const label = (typeof raw.label === "string" && raw.label) || symbol;
  const expiry = resolveZonesExpiryFromStored(raw);
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
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
    expiry,
    today,
    daysToExpiry: daysUntilExpiry(expiry),
    strikeStep: round(num(raw.strikeStep)),
    mode,
    isFutures: mode === "futures",
  };
}

/**
 * Estimate each leg's premium from ATM IV (Black-Scholes) and compute the
 * strategy's expiry economics server-side. Returns null when we can't price
 * (e.g. no ATM IV) so the UI falls back to Fynn's qualitative text.
 */
function economicsForStrategy(
  legs: FynnPlan["strategies"][number]["legs"],
  ctx: FynnContext,
): StrategyEconomics | null {
  if (ctx.spot == null || ctx.atmIV == null || ctx.daysToExpiry == null) return null;
  const priced: StrategyLeg[] = [];
  for (const leg of legs) {
    if (leg.instrument === "future") {
      // The future is entered at market (≈ spot); it carries no upfront premium.
      priced.push({ kind: "future", action: leg.action, entry: ctx.spot });
      continue;
    }
    if (leg.optionType == null || leg.strike == null) return null;
    const premium = blackScholesPrice(
      leg.optionType,
      ctx.spot,
      leg.strike,
      ctx.atmIV,
      ctx.daysToExpiry,
    );
    if (premium == null) return null;
    priced.push({
      kind: "option",
      action: leg.action,
      optionType: leg.optionType,
      strike: leg.strike,
      premium,
    });
  }
  const econ = computeStrategyEconomics(priced);
  if (!econ) return null;

  // Direction of any net futures exposure, and whether its favourable side is
  // actually capped by a sold option (a collar) or runs open-ended.
  const dir = futureDirection(legs);
  const favourableCapped = dir != null && isFavourableCapped(legs, dir);
  const directionalFutureOpen = dir != null && !favourableCapped;

  econ.scenario = projectionFor(priced, ctx, econ, dir, directionalFutureOpen);

  // A directional future has no real profit cap (a short is only "capped" by
  // price hitting ₹0, which isn't a tradeable target). Present it as
  // open-ended and let the scenario row carry the realistic reward, instead of
  // a misleading price-to-zero max and a huge reward:risk.
  if (directionalFutureOpen) {
    econ.maxProfit = null;
    econ.riskReward = null;
  }
  return econ;
}

function futureDirection(
  legs: FynnPlan["strategies"][number]["legs"],
): "up" | "down" | null {
  const f = legs.find((l) => l.instrument === "future");
  if (!f) return null;
  return f.action === "buy" ? "up" : "down";
}

/** Long future capped by a sold call, or short future capped by a sold put. */
function isFavourableCapped(
  legs: FynnPlan["strategies"][number]["legs"],
  dir: "up" | "down",
): boolean {
  const wantType = dir === "up" ? "CE" : "PE";
  return legs.some(
    (l) => l.instrument !== "future" && l.action === "sell" && l.optionType === wantType,
  );
}

function fmtScenarioLevel(ctx: FynnContext, n: number): string {
  const v = n >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toLocaleString("en-IN");
  return `${ctx.currency}${v}`;
}

/**
 * Project the P&L if price travels to the nearest opposing zone: resistance for
 * longs, support for shorts. This is a conditional "what-if", NOT a target. It
 * applies to open-ended directional futures and to open-ended option positions
 * (e.g. a long call), giving a realistic reward and reward:risk to anchor on.
 */
function projectionFor(
  priced: StrategyLeg[],
  ctx: FynnContext,
  econ: StrategyEconomics,
  futureDir: "up" | "down" | null,
  directionalFutureOpen: boolean,
): { label: string; pnl: number; rewardRisk: number | null } | null {
  if (ctx.spot == null) return null;

  let dir: "up" | "down" | null = futureDir;
  if (dir) {
    // For a future, only project when the favourable side is genuinely open.
    if (!directionalFutureOpen) return null;
  } else {
    // No future: only project for an open-ended option payoff (e.g. long call).
    if (econ.maxProfit != null) return null;
    const upGain = strategyPayoffAt(priced, ctx.spot * 3) - strategyPayoffAt(priced, ctx.spot);
    const downGain =
      strategyPayoffAt(priced, Math.max(1, ctx.spot * 0.5)) - strategyPayoffAt(priced, ctx.spot);
    if (upGain > downGain && upGain > 0) dir = "up";
    else if (downGain > 0) dir = "down";
  }
  if (!dir) return null;

  const target =
    dir === "up"
      ? (ctx.resistanceLow ?? ctx.resistanceHigh ?? ctx.callWallStrike)
      : (ctx.supportHigh ?? ctx.supportLow ?? ctx.putWallStrike);
  if (target == null) return null;
  if (dir === "up" && target <= ctx.spot) return null;
  if (dir === "down" && target >= ctx.spot) return null;

  const pnl = strategyPayoffAt(priced, target);
  const rewardRisk =
    econ.maxLoss != null && econ.maxLoss > 0 && pnl > 0
      ? Math.round((pnl / econ.maxLoss) * 100) / 100
      : null;
  const zone = dir === "up" ? "resistance" : "support";
  return {
    label: `If price reaches ${zone} ${fmtScenarioLevel(ctx, target)}`,
    pnl,
    rewardRisk,
  };
}

/**
 * Build the scorer's neutral inputs from the live context: reuses the zone-doc
 * fields, converts the wall OI deltas to day-over-day %, and layers in a
 * self-referential IV percentile from the symbol's IV history (best-effort).
 * News / PVT are not yet wired here — the engine renormalises over what's present.
 */
async function buildScoreInputs(
  ctx: FynnContext,
  raw: Record<string, unknown>,
): Promise<ScoreInputs> {
  const [ivPct, pvtSlope] = await Promise.all([
    (async () => {
      try {
        const hist = await loadIvHistory(getAdminFirestore(), ctx.symbol);
        return ivPercentile(hist.values, ctx.atmIV);
      } catch {
        return null;
      }
    })(),
    fetchPvtSlope(ctx.scope, ctx.symbol),
  ]);
  return scoreInputsFromFynnContext(ctx, {
    ivPercentile: ivPct,
    putOiChangePct: oiChangePct(num(raw.bullOI), num(raw.bullOIChange)),
    callOiChangePct: oiChangePct(num(raw.bearOI), num(raw.bearOIChange)),
    pvtSlope,
  });
}

/** Score one strategy: derive its vol posture from the legs + economics kind. */
function scoreOneStrategy(
  strategy: FynnPlan["strategies"][number],
  economics: StrategyEconomics | null,
  inputs: ScoreInputs,
  direction: ReturnType<typeof computeDirection>,
): SetupScore {
  const posture = postureFromLegs(strategy.legs, economics?.kind ?? null);
  const strikes = strategy.legs
    .map((l) => l.strike)
    .filter((k): k is number => typeof k === "number" && Number.isFinite(k));
  return scoreStrategy({
    stance: strategy.stance,
    posture,
    inputs,
    strikes,
    riskReward: economics?.riskReward ?? null,
    direction,
  });
}

export async function POST(request: NextRequest) {
  let body: { scope?: string; symbol?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scope = body.scope === "index" ? "index" : body.scope === "stock" ? "stock" : null;
  const mode: FynnMode = body.mode === "futures" ? "futures" : "options";
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

  const context = buildContext(scope, symbol, mode, raw);
  if (context.spot == null && context.maxPain == null) {
    return NextResponse.json(
      { error: "Levels are still being computed for this symbol. Try again shortly." },
      { status: 409 },
    );
  }

  try {
    const { plan, label, cached, stale, source } = await getFynnPlan(context);
    const scoreInputs = await buildScoreInputs(context, raw);
    const direction = computeDirection(scoreInputs);
    const strategies = plan.strategies
      .map((s) => {
        const economics = economicsForStrategy(s.legs, context);
        return { ...s, economics, score: scoreOneStrategy(s, economics, scoreInputs, direction) };
      })
      // Rank by the deterministic composite (replaces the LLM's best-first order).
      .sort((a, b) => b.score.composite - a.score.composite);
    const enriched = { ...plan, strategies };
    return NextResponse.json(
      {
        symbol,
        label,
        mode,
        plan: enriched,
        setup: {
          direction: direction.value,
          directionLabel: direction.label,
          topScore: strategies[0]?.score.composite ?? null,
        },
        pricing: context.atmIV != null ? "estimated" : "unavailable",
        cached,
        stale: stale ?? false,
        source,
        disclaimer: mode === "futures" ? FYNN_FUTURES_DISCLAIMER : FYNN_DISCLAIMER,
      },
      {
        headers: {
          "Cache-Control": cached ? "private, max-age=300" : "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[Fynn]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Fynn could not put together a plan right now. Please try again." },
      { status: 500 },
    );
  }
}
