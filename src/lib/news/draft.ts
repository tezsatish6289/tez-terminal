import "server-only";

import { geminiGroundedText, geminiJson } from "@/lib/news/gemini";
import { clampCaption, getPlatform, normalizeCaption } from "@/lib/social/platforms";
import type { NewsDraft } from "@/lib/news/types";

const WEBSITE = "https://fnoninja.com";

/**
 * Compliance posture (mirrors the site disclaimer): FNONINJA is informational /
 * educational only, NOT SEBI-registered, and gives no investment advice. Every
 * generated caption must stay neutral and avoid buy/sell/recommendation language.
 */
const GUARDRAILS = `
BRAND & COMPLIANCE RULES (must follow exactly):
- Voice: FNO Ninja — an NSE F&O option-chain analytics brand. Neutral, factual, educational.
- NEVER give investment advice, buy/sell calls, price targets, or recommendations.
- NEVER promise returns or imply certainty about market direction.
- No hype, no clickbait, no fabricated numbers. Only use facts grounded in the research.
- These are informational market-news posts for independent research only.
`.trim();

/** Step 1 — grounded research from the user's freeform prompt (text + link + directions). */
function researchPrompt(userPrompt: string): string {
  return `You are a markets research assistant for FNO Ninja (NSE F&O option-chain analytics).

The user will paste a piece of news plus any links and their own directions. Do thorough,
up-to-date research using Google Search and write a concise, factual brief.

USER INPUT (news + link + directions):
"""
${userPrompt}
"""

Write a tight research brief (180-260 words) covering:
- What happened (the core facts, with concrete figures/dates where available).
- Relevant context and why it matters for Indian markets / F&O traders.
- Any important caveats or uncertainty.
Stay strictly factual and grounded in sources. Do NOT give trading advice or recommendations.
Output plain prose only (no markdown headings).`;
}

/** Step 2 — turn the brief + directions into per-platform captions + image prompt. */
function captionPrompt(userPrompt: string, brief: string): string {
  return `${GUARDRAILS}

You are writing social posts for FNO Ninja about a market-news item.

ORIGINAL USER INPUT (includes their directions — honor them):
"""
${userPrompt}
"""

RESEARCH BRIEF (your single source of truth for facts — do not invent beyond it):
"""
${brief}
"""

Produce a JSON object with these fields:
- "headline": a crisp, factual headline, max 70 characters, no hashtags, no emoji.
- "summary": 1-2 sentence plain summary of the news (for internal review).
- "imagePrompt": 90-140 word art direction for an AI image model that will draw ONLY the background (we overlay headline text). Describe a bold, cinematic, story-specific editorial illustration — concrete visual metaphors tied to THIS news (e.g. RBI building silhouette, NSE glow, sector icons, rupee liquidity ribbons, options-chain lattice, Mumbai skyline). Rich palette on deep navy (#080f1e) with vivid accent lighting (electric blue, amber, or emerald by tone). Volumetric rays, glass reflections, holographic data particles — NOT generic bland chart wallpaper. Upper 60% hero visual; lower 40% fades darker/simpler for text. No text, logos, numbers, watermarks, or faces. 4:5 vertical.
- "twitter": post for X. <= 200 chars. 1-2 relevant hashtags. May end with ${WEBSITE}.
- "facebook": post for Facebook. <= 380 chars. Friendly, informative.
- "linkedin": post for LinkedIn. <= 1000 chars. Professional, analytical tone.
- "instagram": caption for Instagram. <= 1400 chars. Clear, a few hashtags.
Rules for every caption:
- Lead with the news. Be specific but concise. Plain text (no markdown, no ** bold **).
- Include a brief "Informational only · not investment advice." style note where it fits naturally.
- Do not exceed the per-field character limits above.`;
}

const CAPTION_SCHEMA = {
  headline: { type: "string" },
  summary: { type: "string" },
  imagePrompt: { type: "string" },
  twitter: { type: "string" },
  facebook: { type: "string" },
  linkedin: { type: "string" },
  instagram: { type: "string" },
} as const;

/** Fallback background-art prompt when the caption step omits imagePrompt. */
export function buildImagePrompt(headline: string, summary?: string): string {
  const ctx = summary?.trim() ? `\nStory context: ${summary.trim().slice(0, 300)}` : "";
  return `Bold editorial cover illustration for Indian financial news: "${headline}".${ctx}

Art direction: cinematic financial journalism — vivid and story-specific, NOT a bland corporate template. Use concrete metaphors tied to the headline (central bank architecture, trading-floor energy, sector silhouettes, rupee liquidity streams, options-chain lattice, monsoon cityscape, policy document glow).

Palette: deep navy (#080f1e) base with dramatic accent lighting — electric blue, amber gold, or emerald by story tone. Volumetric light rays, glass reflections, holographic data particles, strong depth.

Composition: 4:5 vertical. Hero visual in upper 60%; lower 40% fades darker and simpler for text overlay.

STRICT: No text, letters, numbers, logos, watermarks, or human faces. Magazine-quality detail.`;
}

export async function generateNewsDraft(userPrompt: string): Promise<NewsDraft> {
  const input = userPrompt.trim();
  if (!input) throw new Error("Provide the news text / link / directions first.");

  const { text: brief, sources } = await geminiGroundedText(researchPrompt(input));

  const raw = await geminiJson<{
    headline?: string;
    summary?: string;
    imagePrompt?: string;
    twitter?: string;
    facebook?: string;
    linkedin?: string;
    instagram?: string;
  }>(captionPrompt(input, brief), CAPTION_SCHEMA, [
    "headline",
    "imagePrompt",
    "twitter",
    "facebook",
    "linkedin",
    "instagram",
  ]);

  const clamp = (s: string | undefined, platformId: "twitter" | "facebook" | "linkedin" | "instagram") =>
    clampCaption(normalizeCaption(s ?? ""), getPlatform(platformId)!.postBudget);

  const headline = (raw.headline ?? "").replace(/\s+/g, " ").trim().slice(0, 90) || "Market update";
  const summary = (raw.summary ?? brief).trim();
  const imagePrompt =
    (raw.imagePrompt ?? "").replace(/\s+/g, " ").trim() || buildImagePrompt(headline, summary);

  return {
    headline,
    summary,
    sources,
    captions: {
      twitter: clamp(raw.twitter, "twitter"),
      facebook: clamp(raw.facebook, "facebook"),
      linkedin: clamp(raw.linkedin, "linkedin"),
      instagram: clamp(raw.instagram, "instagram"),
    },
    imagePrompt,
  };
}
