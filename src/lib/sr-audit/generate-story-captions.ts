/**
 * Per-platform captions for an SR-audit success story ("win" reel). Mirrors the
 * put/call caption generator (src/lib/videos/generate-captions.ts) — Gemini with
 * a deterministic template fallback — but the subject is a single completed move
 * that ran from a wall to max pain.
 *
 * Informational only (no buy/sell advice): we describe what already happened
 * (price bounced off a put wall / rejected a call wall and travelled to max pain).
 */

import { callGemini } from "@/lib/videos/generate-captions";
import { normalizeCaption } from "@/lib/social/platforms";
import { captionsForUi, type VideoCaptionOutput, type VideoCaptionsForUi } from "@/lib/videos/video-caption-types";
import type { SuccessStoryCandidate } from "@/lib/videos/success-story";

const WEBSITE = "https://fnoninja.com";

export interface StoryCaptionPayload {
  symbol: string;
  label: string;
  scope: "stock" | "index";
  /** "support" = bounced off a put wall (bullish); "resistance" = rejected at a call wall (bearish). */
  side: "support" | "resistance";
  setup: string; // human phrase, e.g. "put-wall bounce"
  movePct: string; // e.g. "2.8"
  entrySpot: string; // formatted price
  maxPain: string; // formatted price
  clusterStrike: string; // dominant wall strike, formatted
  enteredOn: string; // "20 Jun 2026"
  hitOn: string; // "24 Jun 2026"
  website: string;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function buildStoryCaptionPayload(c: SuccessStoryCandidate): StoryCaptionPayload {
  return {
    symbol: c.symbol,
    label: c.label || c.symbol,
    scope: c.scope === "index" ? "index" : "stock",
    side: c.side,
    setup: c.side === "support" ? "put-wall bounce (support held)" : "call-wall rejection (resistance held)",
    movePct: (c.movePct ?? 0).toFixed(1),
    entrySpot: fmtPrice(c.entrySpot),
    maxPain: fmtPrice(c.maxPain),
    clusterStrike: fmtPrice(c.clusterStrike ?? (c.side === "support" ? c.putClusterStrike : c.callClusterStrike)),
    enteredOn: fmtDate(c.eventAt),
    hitOn: fmtDate(c.pocHitAt),
    website: WEBSITE,
  };
}

function promptIntro(p: StoryCaptionPayload): string {
  const dataJson = JSON.stringify(p, null, 2);
  const dir = p.side === "support" ? "bounced higher" : "sold off";
  return `You write FNO Ninja (fnoninja.com) social captions for Indian F&O markets.

This is a SUCCESS-STORY recap of a COMPLETED move (it already happened — past tense):
${dataJson}

Story: ${p.label} (${p.symbol}) had a ${p.setup}. After entering near ${p.entrySpot}, price ${dir} and reached the max-pain target around ${p.maxPain} — a +${p.movePct}% move. Entered ${p.enteredOn}, target hit ${p.hitOn}.

Rules: informational / educational recap only — NO buy/sell advice, NO "you should". Past tense. PLAIN TEXT — no markdown, no asterisks (social shows ** literally). Mention the +${p.movePct}% move and that price ran to max pain. CTA → ${p.website}.

Return valid JSON only. Use \\n for line breaks inside string values (never raw unescaped newlines).`;
}

export function buildStoryTemplateCaptions(p: StoryCaptionPayload): VideoCaptionOutput {
  const dir = p.side === "support" ? "bounced off the put wall" : "rejected at the call wall";
  const tag = p.side === "support" ? "#SupportHeld" : "#ResistanceHeld";
  const when = `Entered ${p.enteredOn} → target hit ${p.hitOn}`;

  const twitter = [
    `FNO Ninja win recap 🎯`,
    "",
    `${p.label} ${dir} near ${p.entrySpot} and ran +${p.movePct}% to max pain (${p.maxPain}).`,
    "",
    `Live zones → ${p.website}`,
    "",
    `${tag} #FNONinja #StockMarket`,
  ].join("\n");

  const facebook = [
    `🎯 FNO Ninja success story`,
    "",
    `${p.label} (${p.symbol}) had a clean ${p.setup}. Price ${dir} around ${p.entrySpot} and travelled +${p.movePct}% to the max-pain target near ${p.maxPain}.`,
    "",
    when,
    "",
    `Educational recap only — not investment advice.`,
    "",
    `See live wall + max-pain zones 👇`,
    p.website,
    "",
    `#FNONinja #StockMarketIndia #Trading`,
  ].join("\n");

  const linkedin = [
    `FNO Ninja — Success Story`,
    "",
    `${p.label} (${p.symbol}) ${dir} near ${p.entrySpot} and reached the max-pain target around ${p.maxPain}, a +${p.movePct}% move.`,
    "",
    when,
    "",
    `A clean example of how option-wall + max-pain levels framed the move. Shared for educational purposes — not investment advice.`,
    "",
    `Explore live zones: ${p.website}`,
    "",
    `#StockMarket #OptionsData #IndianStocks #FNONinja`,
  ].join("\n");

  const instagram = [
    `🎯 FNO Ninja win recap`,
    "",
    `${p.label} ${dir} near ${p.entrySpot}`,
    `→ ran +${p.movePct}% to max pain (${p.maxPain}) 📈`,
    "",
    when,
    "",
    `Educational recap only.`,
    "",
    `Live zones → link in bio`,
    p.website,
    "",
    `#FNONinja #StockMarket #OptionsTrading #IndianStocks #MaxPain #PriceAction`,
  ].join("\n");

  const youtubeTitle = `${p.label} +${p.movePct}% to Max Pain | FNO Ninja Win Recap`;
  const youtubeDescription = [
    `${p.label} (${p.symbol}) ${dir} near ${p.entrySpot} and reached the max-pain target around ${p.maxPain} — a +${p.movePct}% move.`,
    "",
    when,
    "",
    `Educational recap of how the wall + max-pain levels framed the move. Not investment advice.`,
    "",
    `Live zones: ${p.website}`,
    "",
    `#FNONinja #StockMarket #MaxPain #shorts`,
  ].join("\n");

  return { twitter, facebook, linkedin, instagram, youtubeTitle, youtubeDescription };
}

async function generateStoryCaptions(p: StoryCaptionPayload): Promise<VideoCaptionOutput> {
  const intro = promptIntro(p);
  try {
    const [batchA, batchB] = await Promise.all([
      callGemini(
        `${intro}\n\nGenerate twitter, facebook, linkedin captions. Twitter <=280 chars if possible. Engaging, platform-native, past-tense recap tone.`,
        { twitter: { type: "string" }, facebook: { type: "string" }, linkedin: { type: "string" } },
        ["twitter", "facebook", "linkedin"],
      ),
      callGemini(
        `${intro}\n\nGenerate youtubeTitle (<=90 chars), youtubeDescription, instagram captions.`,
        { youtubeTitle: { type: "string" }, youtubeDescription: { type: "string" }, instagram: { type: "string" } },
        ["youtubeTitle", "youtubeDescription", "instagram"],
      ),
    ]);
    return {
      twitter: batchA.twitter,
      facebook: batchA.facebook,
      linkedin: batchA.linkedin,
      youtubeTitle: batchB.youtubeTitle,
      youtubeDescription: batchB.youtubeDescription,
      instagram: batchB.instagram,
    };
  } catch (err) {
    console.warn("[generate-story-captions] AI failed, using template fallback:", err);
    return buildStoryTemplateCaptions(p);
  }
}

/** Generate + clean per-platform captions for a success story candidate. */
export async function generateStoryCaptionsFromCandidate(
  c: SuccessStoryCandidate,
): Promise<VideoCaptionsForUi> {
  const payload = buildStoryCaptionPayload(c);
  const output = await generateStoryCaptions(payload);
  const cleaned: VideoCaptionOutput = {
    twitter: normalizeCaption(output.twitter),
    facebook: normalizeCaption(output.facebook),
    linkedin: normalizeCaption(output.linkedin),
    instagram: normalizeCaption(output.instagram),
    youtubeTitle: normalizeCaption(output.youtubeTitle),
    youtubeDescription: normalizeCaption(output.youtubeDescription),
  };
  return captionsForUi(cleaned);
}
