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

/** Default lookback: 4 weeks of news (UI no longer toggles window). */
export const LEVELS_NEWS_WINDOW_DAYS = 28;
export const NEWS_WINDOWS = [LEVELS_NEWS_WINDOW_DAYS] as const;
export type NewsWindow = (typeof NEWS_WINDOWS)[number];

/** AI-assessed tone from grounded headlines (not a trading signal). */
export type NewsSentimentLabel = "bullish" | "neutral" | "bearish";

export interface NewsSentiment {
  label: NewsSentimentLabel;
  /** 0 = very bearish, 50 = mixed, 100 = very bullish. */
  score: number;
  /** One-line rationale shown beside the badge. */
  note: string;
}

/** Label thresholds paired with the prompt rubric. */
export const SENTIMENT_LABEL_THRESHOLDS = {
  bullishMin: 65,
  bearishMax: 40,
} as const;

export function clampSentimentScore(raw: number): number {
  if (!Number.isFinite(raw)) return 50;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function sentimentLabelFromScore(score: number): NewsSentimentLabel {
  if (score >= SENTIMENT_LABEL_THRESHOLDS.bullishMin) return "bullish";
  if (score <= SENTIMENT_LABEL_THRESHOLDS.bearishMax) return "bearish";
  return "neutral";
}

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
  sentiment?: NewsSentiment;
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
  return n === 14 ? 14 : LEVELS_NEWS_WINDOW_DAYS;
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

const SENTIMENT_RUBRIC = [
  `Score recent news sentiment for a short-term trader (grounded facts only, not investment advice):`,
  `- SENTIMENT_SCORE: integer 0-100 (0=very bearish, 50=neutral/mixed, 100=very bullish)`,
  `- SENTIMENT_LABEL: exactly one of Bullish, Neutral, Bearish`,
  `  - Bullish if score >= ${SENTIMENT_LABEL_THRESHOLDS.bullishMin}`,
  `  - Bearish if score <= ${SENTIMENT_LABEL_THRESHOLDS.bearishMax}`,
  `  - Neutral otherwise`,
  `- SENTIMENT_NOTE: one sentence on the main positive and negative drivers`,
  `Approximate scoring (use judgment; do not invent numbers):`,
  `- Earnings beat / guidance raise (last 30d): +20 to +30`,
  `- Analyst upgrades / higher targets (last 30d): +15 to +25`,
  `- Positive orders, expansion, dividends: +5 to +15`,
  `- Earnings miss / guidance cut (last 30d): -20 to -30`,
  `- Downgrades / lower targets (last 30d): -15 to -25`,
  `- Regulatory, legal, or management negatives: -10 to -20`,
  `- Upcoming earnings: ±10 only if a grounded consensus or forecast tone exists`,
  `If coverage is thin, use score near 50 and label Neutral.`,
].join("\n");

function buildPrompt(target: { scope: LevelsNewsScope; symbol: string; name: string }, window: NewsWindow): string {
  const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  if (target.scope === "index") {
    return [
      `You are a concise Indian markets news analyst.`,
      `Summarize the most important news affecting the NSE index "${target.name}" (${target.symbol}) from the last ${window} days (between ${since} and ${today}).`,
      `Also check the last 30 days (since ${since30}) for heavyweight constituent earnings and index-level forecast commentary.`,
      `Focus on: index moves and drivers, heavyweight constituents, sector rotation, FII/DII flows, RBI / policy, global cues, and major earnings within the index.`,
      `Use only information you can ground in recent, reputable sources.`,
      ``,
      SENTIMENT_RUBRIC,
      ``,
      `Respond in EXACTLY this format and nothing else:`,
      `SENTIMENT_SCORE: <integer>`,
      `SENTIMENT_LABEL: <Bullish|Neutral|Bearish>`,
      `SENTIMENT_NOTE: <one sentence>`,
      `SUMMARY: <3-4 neutral sentences on what moved this index and why over the window>`,
      `HIGHLIGHTS:`,
      `- <most recent first; one material item per line, include the date when known>`,
      `(5 to 7 highlight lines max. If there is no material news, write "- No major index-specific news in this window.")`,
    ].join("\n");
  }

  return [
    `You are a concise Indian equities news analyst.`,
    `Summarize the most important news about "${target.name}" (NSE: ${target.symbol}), an Indian listed company, from the last ${window} days (between ${since} and ${today}).`,
    `Explicitly search for and include in HIGHLIGHTS when grounded (prioritize last 30 days since ${since30}):`,
    `1) Analyst ratings / target changes (broker, action, date).`,
    `2) Reported earnings or results in the last 30 days (quarter, key numbers vs expectations if available).`,
    `3) Upcoming earnings date and published consensus or forecast, if any.`,
    `Also cover: guidance, large orders, management or board actions, dividends/buybacks, regulatory actions, and M&A.`,
    `Use only information you can ground in recent, reputable sources. Do not include generic background or unrelated companies.`,
    ``,
    SENTIMENT_RUBRIC,
    ``,
    `Respond in EXACTLY this format and nothing else:`,
    `SENTIMENT_SCORE: <integer>`,
    `SENTIMENT_LABEL: <Bullish|Neutral|Bearish>`,
    `SENTIMENT_NOTE: <one sentence>`,
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

function parseSentimentLabel(raw: string): NewsSentimentLabel {
  const t = raw.trim().toLowerCase();
  if (t.includes("bull")) return "bullish";
  if (t.includes("bear")) return "bearish";
  return "neutral";
}

function parseModelText(text: string): {
  summary: string;
  highlights: string[];
  sentiment: NewsSentiment;
} {
  const cleaned = text.replace(/\r/g, "").trim();

  const scoreMatch = cleaned.match(/SENTIMENT_SCORE:\s*(\d{1,3})/i);
  const labelMatch = cleaned.match(/SENTIMENT_LABEL:\s*(\w+)/i);
  const noteMatch = cleaned.match(/SENTIMENT_NOTE:\s*([^\n]+)/i);
  const score = clampSentimentScore(scoreMatch ? Number(scoreMatch[1]) : 50);
  const label = labelMatch
    ? parseSentimentLabel(labelMatch[1])
    : sentimentLabelFromScore(score);
  const alignedLabel = sentimentLabelFromScore(score);
  const sentiment: NewsSentiment = {
    score,
    label: label === alignedLabel || !labelMatch ? alignedLabel : label,
    note: (noteMatch?.[1] ?? "").trim() || "Mixed or limited recent coverage.",
  };

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
    sentiment,
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

  const { summary, highlights, sentiment } = parseModelText(response.text ?? "");
  const citations = extractCitations(response.custom as RawGroundedResponse);

  return {
    scope: target.scope,
    symbol: target.symbol,
    name: target.name,
    window,
    summary,
    highlights,
    citations,
    sentiment,
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
