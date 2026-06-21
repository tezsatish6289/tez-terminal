/**
 * Cached Fynn strategy plans — avoids a Gemini call on every "Ask Fynn" click.
 *
 * Plans are keyed by scope+symbol and invalidated when the option-derived
 * context fingerprint changes (levels/IV/expiry date) or after a TTL. Economics
 * (₹ risk/reward) are NOT cached here — callers recompute those cheaply from
 * the live context on every response.
 *
 * Server-only.
 */

import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import {
  generateFynnPlan,
  type FynnContext,
  type FynnPlan,
} from "@/ai/flows/fynn-strategy-flow";
import { buildRulesFynnPlan, ensureValidFynnPlan } from "@/lib/levels/fynn-plan-rules";

/** Reuse a plan while the option-derived inputs are unchanged (see fingerprint). */
const FRESH_TTL_MS = 8 * 60 * 60 * 1000; // 8h — same cadence as levels news
/** Serve last-good plan if generation fails. */
const STALE_TTL_MS = 72 * 60 * 60 * 1000; // 3d

export interface FynnPlanCacheDoc {
  scope: "stock" | "index";
  symbol: string;
  mode: "options" | "futures";
  label: string;
  plan: FynnPlan;
  /** Hash of the levels/IV/time inputs Fynn reasons over. */
  contextFingerprint: string;
  generatedAt: string;
}

export interface FynnPlanResult {
  plan: FynnPlan;
  label: string;
  /** True when served from cache without a new Gemini call. */
  cached: boolean;
  /** True when generation failed and an older plan was returned. */
  stale?: boolean;
  /** Whether the plan came from the LLM or the rules fallback. */
  source: "ai" | "rules";
}

const memCache = new Map<string, FynnPlanCacheDoc>();
const inflight = new Map<string, Promise<FynnPlanResult>>();

function cacheKey(scope: string, symbol: string, mode: string): string {
  return `${scope}:${symbol}:${mode}`;
}

function docPath(scope: string, symbol: string, mode: string): string {
  return `config/fynn_plan_${scope}_${symbol}_${mode}`;
}

/** Stable key — regenerate only when material inputs change, not every zone tick. */
export function fynnContextFingerprint(ctx: FynnContext): string {
  const parts = [
    ctx.mode,
    ctx.today,
    ctx.daysToExpiry,
    ctx.expiry,
    ctx.spot,
    ctx.maxPain,
    ctx.supportLow,
    ctx.supportHigh,
    ctx.resistanceLow,
    ctx.resistanceHigh,
    ctx.putWallStrike,
    ctx.putWallSize,
    ctx.callWallStrike,
    ctx.callWallSize,
    ctx.atmIV,
    ctx.volRegime,
    ctx.daysToEarnings,
  ];
  return parts.map((p) => (p == null ? "" : String(p))).join("|");
}

function isFresh(doc: FynnPlanCacheDoc, now: number): boolean {
  return now - new Date(doc.generatedAt).getTime() < FRESH_TTL_MS;
}

function isUsableStale(doc: FynnPlanCacheDoc, now: number): boolean {
  return now - new Date(doc.generatedAt).getTime() < STALE_TTL_MS;
}

/**
 * Same idea as levels news: serve from Firestore until stale.
 *
 * News: stale = older than 8h (headlines change on their own).
 * Fynn: stale = saved "market snapshot" no longer matches live zone data
 *       (spot, bands, OI walls, IV, expiry countdown, etc.), OR older than 8h.
 *       ₹ risk/reward is always recomputed on read — not cached.
 */
function serveCachedDoc(
  doc: FynnPlanCacheDoc,
  fingerprint: string,
  now: number,
): FynnPlanCacheDoc | null {
  if (doc.contextFingerprint !== fingerprint) return null;
  if (!isFresh(doc, now)) return null;
  return doc;
}

async function readCacheDoc(
  scope: string,
  symbol: string,
  mode: string,
): Promise<FynnPlanCacheDoc | undefined> {
  try {
    const snap = await getAdminFirestore().doc(docPath(scope, symbol, mode)).get();
    if (!snap.exists) return undefined;
    return snap.data() as FynnPlanCacheDoc;
  } catch {
    return undefined;
  }
}

async function writeCacheDoc(doc: FynnPlanCacheDoc): Promise<void> {
  try {
    await getAdminFirestore()
      .doc(docPath(doc.scope, doc.symbol, doc.mode))
      .set(doc, { merge: false });
  } catch {
    /* best effort */
  }
}

/**
 * Return a Fynn plan for this context. Hits Firestore + in-memory cache when the
 * fingerprint matches; otherwise one Gemini call (deduped across concurrent requests).
 */
export async function getFynnPlan(context: FynnContext): Promise<FynnPlanResult> {
  const fingerprint = fynnContextFingerprint(context);
  const key = cacheKey(context.scope, context.symbol, context.mode);
  const now = Date.now();

  const mem = memCache.get(key);
  const fromMem = mem ? serveCachedDoc(mem, fingerprint, now) : null;
  if (fromMem) {
    const validated = ensureValidFynnPlan(fromMem.plan, context);
    if (validated.source === "ai") {
      return { plan: validated.plan, label: fromMem.label, cached: true, source: "ai" };
    }
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<FynnPlanResult> => {
    const cached = await readCacheDoc(context.scope, context.symbol, context.mode);
    const fromDoc = cached ? serveCachedDoc(cached, fingerprint, now) : null;
    if (fromDoc) {
      const validated = ensureValidFynnPlan(fromDoc.plan, context);
      if (validated.source === "ai") {
        memCache.set(key, fromDoc);
        return { plan: validated.plan, label: fromDoc.label, cached: true, source: "ai" };
      }
      const rules = buildRulesFynnPlan(context);
      const doc: FynnPlanCacheDoc = {
        scope: context.scope,
        symbol: context.symbol,
        mode: context.mode,
        label: context.label,
        plan: rules,
        contextFingerprint: fingerprint,
        generatedAt: new Date().toISOString(),
      };
      memCache.set(key, doc);
      void writeCacheDoc(doc);
      return { plan: rules, label: context.label, cached: false, source: "rules" };
    }

    try {
      const rawPlan = await generateFynnPlan(context);
      const validated = ensureValidFynnPlan(rawPlan, context);
      if (validated.source === "rules") {
        console.warn(
          "[fynn-plan] AI plan rejected, using rules",
          context.symbol,
          validated.issues.join(", "),
        );
      }
      const doc: FynnPlanCacheDoc = {
        scope: context.scope,
        symbol: context.symbol,
        mode: context.mode,
        label: context.label,
        plan: validated.plan,
        contextFingerprint: fingerprint,
        generatedAt: new Date().toISOString(),
      };
      memCache.set(key, doc);
      void writeCacheDoc(doc);
      return {
        plan: validated.plan,
        label: context.label,
        cached: false,
        source: validated.source,
      };
    } catch (err) {
      console.error("[fynn-plan] generation failed", context.symbol, err);
      if (cached && isUsableStale(cached, now)) {
        const validated = ensureValidFynnPlan(cached.plan, context);
        memCache.set(key, cached);
        return {
          plan: validated.plan,
          label: cached.label,
          cached: true,
          stale: true,
          source: validated.source,
        };
      }
      return {
        plan: buildRulesFynnPlan(context),
        label: context.label,
        cached: false,
        source: "rules",
      };
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
