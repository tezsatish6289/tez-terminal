/**
 * AI-grounded news for the freedombot.ai/levels chart pages.
 *
 * Uses Gemini 2.5 Flash with Google Search grounding so each summary ships with
 * real source URLs (grounding chunks) rather than model-invented links. Results
 * are cached in Firestore (cross-instance) + in-memory so a grounded call never
 * runs per page view — only when the cache is stale.
 *
 * Server-only.
 */

import "server-only";
import { ai } from "@/ai/genkit";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_SPECS } from "@/lib/index-options-zones";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  isValidFnoSymbol,
  normalizeStockSymbol,
} from "@/lib/equity-zones-on-demand";

export type LevelsNewsScope = "stock" | "index";

/** Only 14 / 28 day windows are offered in the UI. */
export const NEWS_WINDOWS = [14, 28] as const;
export type NewsWindow = (typeof NEWS_WINDOWS)[number];

export interface NewsCitation {
  title: string;
  url: string;
}

export interface LevelsNews {
  scope: LevelsNewsScope;
  symbol: string;
  /** Company / index display name used in the query. */
  name: string;
  window: NewsWindow;
  summary: string;
  highlights: string[];
  citations: NewsCitation[];
  generatedAt: string;
  /** True when served from cache past the soft-fresh window. */
  stale?: boolean;
}

/** Regenerate at most this often per (symbol, window). */
const FRESH_TTL_MS = 8 * 60 * 60 * 1000; // 8h
/** Serve a cached doc this long even if generation later fails. */
const STALE_TTL_MS = 72 * 60 * 60 * 1000; // 3d

const memCache = new Map<string, LevelsNews>();
const inflight = new Map<string, Promise<LevelsNews>>();

function cacheKey(scope: LevelsNewsScope, symbol: string, window: NewsWindow): string {
  return `${scope}:${symbol}:${window}`;
}

function docPath(scope: LevelsNewsScope, symbol: string, window: NewsWindow): string {
  return `config/levels_news_${scope}_${symbol}_${window}`;
}

export function normalizeNewsWindow(raw: string | null | undefined): NewsWindow {
  const n = Number(raw);
  return n === 14 ? 14 : 28;
}

/** Resolve scope+symbol to a normalized key and human name, or null if invalid. */
export function resolveNewsTarget(
  scopeRaw: string,
  symbolRaw: string,
): { scope: LevelsNewsScope; symbol: string; name: string } | null {
  const scope = scopeRaw.toLowerCase() === "index" ? "index" : "stock";
  if (scope === "index") {
    const key = normalizeIndexKey(symbolRaw);
    if (!key) return null;
    return { scope, symbol: key, name: INDEX_SPECS[key].label };
  }
  const symbol = normalizeStockSymbol(symbolRaw);
  if (!symbol || !isValidFnoSymbol(symbol)) return null;
  return { scope, symbol, name: fnoCompanyName(symbol) ?? symbol };
}

function isFresh(news: LevelsNews, now: number): boolean {
  return now - new Date(news.generatedAt).getTime() < FRESH_TTL_MS;
}

function isUsableStale(news: LevelsNews, now: number): boolean {
  return now - new Date(news.generatedAt).getTime() < STALE_TTL_MS;
}

async function readCacheDoc(
  scope: LevelsNewsScope,
  symbol: string,
  window: NewsWindow,
): Promise<LevelsNews | undefined> {
  try {
    const snap = await getAdminFirestore().doc(docPath(scope, symbol, window)).get();
    if (!snap.exists) return undefined;
    return snap.data() as LevelsNews;
  } catch {
    return undefined;
  }
}

async function writeCacheDoc(news: LevelsNews): Promise<void> {
  try {
    await getAdminFirestore()
      .doc(docPath(news.scope, news.symbol, news.window))
      .set(news, { merge: false });
  } catch {
    /* best effort */
  }
}

function buildPrompt(target: { scope: LevelsNewsScope; symbol: string; name: string }, window: NewsWindow): string {
  const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  if (target.scope === "index") {
    return [
      `You are a concise Indian markets news analyst.`,
      `Summarize the most important news affecting the NSE index "${target.name}" (${target.symbol}) from the last ${window} days (between ${since} and ${today}).`,
      `Focus on market-moving developments: index moves and drivers, heavyweight constituents, sector rotation, FII/DII flows, RBI / policy, global cues, and major earnings within the index.`,
      `Use only information you can ground in recent, reputable sources.`,
      ``,
      `Respond in EXACTLY this format and nothing else:`,
      `SUMMARY: <3-4 neutral sentences on what moved this index and why over the window>`,
      `HIGHLIGHTS:`,
      `- <most recent first; one material item per line, include the date when known>`,
      `(5 to 7 highlight lines max. If there is no material news, write "- No major index-specific news in this window.")`,
    ].join("\n");
  }

  return [
    `You are a concise Indian equities news analyst.`,
    `Summarize the most important news about "${target.name}" (NSE: ${target.symbol}), an Indian listed company, from the last ${window} days (between ${since} and ${today}).`,
    `Focus on material, price-relevant events: quarterly results, guidance, large orders/contracts, management changes, board actions, dividends/buybacks, regulatory or legal actions, analyst rating changes, M&A, and capacity/expansion news.`,
    `Use only information you can ground in recent, reputable sources. Do not include generic background or unrelated companies.`,
    ``,
    `Respond in EXACTLY this format and nothing else:`,
    `SUMMARY: <3-4 neutral sentences on the company's recent newsflow over the window>`,
    `HIGHLIGHTS:`,
    `- <most recent first; one material item per line, include the date when known>`,
    `(5 to 7 highlight lines max. If there is no material company-specific news, write "- No major company-specific news in this window.")`,
  ].join("\n");
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}
interface RawGroundedResponse {
  candidates?: Array<{
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
  }>;
}

function parseModelText(text: string): { summary: string; highlights: string[] } {
  const cleaned = text.replace(/\r/g, "").trim();
  const summaryMatch = cleaned.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*HIGHLIGHTS:|$)/i);
  const summary = (summaryMatch?.[1] ?? "").trim();

  const highlightsBlock = cleaned.split(/HIGHLIGHTS:/i)[1] ?? "";
  const highlights = highlightsBlock
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);

  return {
    summary: summary || cleaned.slice(0, 400),
    highlights,
  };
}

function extractCitations(raw: RawGroundedResponse): NewsCitation[] {
  const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const out: NewsCitation[] = [];
  for (const c of chunks) {
    const url = c.web?.uri?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: c.web?.title?.trim() || hostname(url), url });
  }
  return out.slice(0, 12);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function generate(
  target: { scope: LevelsNewsScope; symbol: string; name: string },
  window: NewsWindow,
): Promise<LevelsNews> {
  const response = await ai.generate({
    prompt: buildPrompt(target, window),
    config: { googleSearchRetrieval: true, temperature: 0.3 },
  });

  const { summary, highlights } = parseModelText(response.text ?? "");
  const citations = extractCitations(response.custom as RawGroundedResponse);

  return {
    scope: target.scope,
    symbol: target.symbol,
    name: target.name,
    window,
    summary,
    highlights,
    citations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Cached, grounded news for a levels symbol. Serves fresh cache when available;
 * otherwise generates once (deduped across concurrent callers) and persists.
 * Falls back to recent stale cache if generation fails.
 */
export async function getLevelsNews(
  scopeRaw: string,
  symbolRaw: string,
  windowRaw: string | null | undefined,
): Promise<LevelsNews | null> {
  const target = resolveNewsTarget(scopeRaw, symbolRaw);
  if (!target) return null;
  const window = normalizeNewsWindow(windowRaw);
  const now = Date.now();
  const key = cacheKey(target.scope, target.symbol, window);

  const mem = memCache.get(key);
  if (mem && isFresh(mem, now)) return mem;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<LevelsNews> => {
    const cached = await readCacheDoc(target.scope, target.symbol, window);
    if (cached && isFresh(cached, now)) {
      memCache.set(key, cached);
      return cached;
    }
    try {
      const fresh = await generate(target, window);
      memCache.set(key, fresh);
      void writeCacheDoc(fresh);
      return fresh;
    } catch (err) {
      console.error("[levels-news] generation failed", target.symbol, window, err);
      if (cached && isUsableStale(cached, now)) {
        const stale: LevelsNews = { ...cached, stale: true };
        memCache.set(key, stale);
        return stale;
      }
      throw err;
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
