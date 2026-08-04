import type {
  CaptionPayload,
  VideoCaptionOutput,
  WallIntensity,
  WallType,
} from "./video-caption-types";
import { captionsForUi, type VideoCaptionsForUi } from "./video-caption-types";
import type { TopicStockSummary } from "./build-topic-summary";
import { normalizeCaption } from "@/lib/social/platforms";

export { captionsForUi, type VideoCaptionsForUi };

const WEBSITE = "https://fnoninja.com/today";
const MODEL = "gemini-2.5-flash";

/** Rank → wall strength label (rank 1 = strongest wall in the video). */
export function wallIntensity(rank: number, total: number): WallIntensity {
  if (total <= 1 || rank === 1) return "heavy";
  if (total === 2) return "moderate";
  if (rank === 2) return "moderate";
  if (rank === 3 && total >= 4) return "moderate";
  return "mild";
}

export function wallType(variant: "put" | "call"): WallType {
  return variant === "put" ? "support" : "resistance";
}

function formatPrice(strike: number | null): string {
  if (strike == null) return "—";
  return Number.isInteger(strike) ? `₹${strike}` : `₹${strike}`;
}

function levelLabel(level: WallIntensity): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function wallLabel(wall: WallType): string {
  return wall === "support" ? "Support" : "Resistance";
}

/** Split "17 June 2026 at 06:00 PM" → date + time for captions. */
export function parseObservedAt(
  generatedAtLabel: string | null,
  dateLabel: string,
): { date: string; time: string } {
  if (generatedAtLabel?.trim()) {
    const m = generatedAtLabel.trim().match(/^(.+?)\s+at\s+(.+)$/i);
    if (m) return { date: m[1].trim(), time: `${m[2].trim()} IST` };
  }
  return {
    date: dateLabel?.trim() || "today",
    time: "latest IST",
  };
}

/** Build the exact JSON the caption prompt consumes — no AI guessing on prices or dates. */
export function buildCaptionPayload(summary: {
  variant: "put" | "call";
  dateLabel: string;
  generatedAtLabel: string | null;
  stocks: TopicStockSummary[];
}): CaptionPayload {
  const { date, time } = parseObservedAt(summary.generatedAtLabel, summary.dateLabel);
  const n = summary.stocks.length;

  return {
    date,
    time,
    wallType: wallType(summary.variant),
    stocks: summary.stocks.map((s, i) => ({
      symbol: s.symbol,
      levelType: wallIntensity(i + 1, n),
      price: formatPrice(s.clusterStrike),
    })),
    website: WEBSITE,
  };
}

function apiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      "Gemini API key not configured. Add GOOGLE_GENAI_API_KEY to .env.local and restart the dev server.",
    );
  }
  return key.trim();
}

/** Strip markdown fences and extract the outermost JSON object from Gemini text. */
function parseGeminiJson<T>(raw: string): T {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);

  try {
    return JSON.parse(text) as T;
  } catch (firstErr) {
    // Gemini sometimes emits literal newlines inside JSON strings — escape them and retry.
    const repaired = text.replace(
      /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      (match) => match.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\n"),
    );
    try {
      return JSON.parse(repaired) as T;
    } catch {
      const hint = firstErr instanceof Error ? firstErr.message : "parse error";
      throw new Error(`Gemini returned invalid JSON (${hint}) — try again.`);
    }
  }
}

export async function callGemini(
  prompt: string,
  schema: Record<string, unknown>,
  required: string[],
): Promise<Record<string, string>> {
  const key = apiKey();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: schema,
            required,
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response — try again.");
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini response was truncated — try again.");
  }

  const parsed = parseGeminiJson<Record<string, string>>(text);
  for (const field of required) {
    if (typeof parsed[field] !== "string" || !parsed[field].trim()) {
      throw new Error(`Gemini response missing "${field}" — try again.`);
    }
  }
  return parsed;
}

function promptIntro(payload: CaptionPayload): string {
  const dataJson = JSON.stringify(payload, null, 2);
  const w = wallLabel(payload.wallType);
  return `You write FNO Ninja (fnoninja.com) social captions for Indian F&O markets.

INPUT (keep symbols, prices, date, time EXACT):
${dataJson}

Rules: informational only (no buy/sell advice). Refer to wall strength as Heavy/Moderate/Mild ${w} in PLAIN TEXT — no markdown, no asterisks (social networks show ** literally). CTA → ${payload.website}. Say "${payload.wallType}" not "put/call wall". Date line: "${payload.date} | ${payload.time}".

Return valid JSON only. Use \\n for line breaks inside string values (never raw unescaped newlines).`;
}

/** Deterministic fallback — matches the approved caption style if Gemini fails. */
export function buildTemplateCaptions(payload: CaptionPayload): VideoCaptionOutput {
  const { date, time, wallType, stocks, website } = payload;
  const w = wallLabel(wallType);
  const wLower = wallType;
  const tag = wallType === "support" ? "#SupportLevels" : "#ResistanceLevels";
  const when = `${date} | ${time}`;

  const stockTwitter = stocks
    .map((s) => `${s.symbol} showing **${levelLabel(s.levelType)} ${w}** near ${s.price}`)
    .join("\n");

  const twitter = [
    "FNO Ninja Alert 🚨",
    "",
    stockTwitter,
    "",
    `Market update as of ${when}`,
    "",
    `Full details & live zones → ${website}`,
    "",
    `${tag} #FNONinja #StockMarket`,
  ].join("\n");

  const fbStocks = stocks
    .map((s) => {
      if (s.levelType === "heavy") {
        return `${s.symbol} is currently holding **strong heavy ${wLower}** around ${s.price}`;
      }
      return `${s.symbol} is seeing **${levelLabel(s.levelType).toLowerCase()} ${wLower}** near ${s.price}`;
    })
    .join(". ");

  const facebook = [
    "👋 Friends, quick market update from FNO Ninja!",
    "",
    `${fbStocks}.`,
    "",
    "These levels are worth watching for the next session.",
    "",
    `📅 As of ${when}`,
    "",
    `Want complete analysis and live ${wLower} zones? Check it out here 👇`,
    website,
    "",
    `#FNONinja #StockMarketIndia #Trading`,
  ].join("\n");

  const linkedinBody = stocks
    .map((s) => `${s.symbol} is facing **${levelLabel(s.levelType)} ${w}** near ${s.price}`)
    .join("\n");

  const linkedin = [
    "FNO Ninja Market Update",
    "",
    linkedinBody,
    "",
    `These ${wLower} zones will be key levels to watch in the coming sessions.`,
    "",
    `📅 Data as of ${when}`,
    "",
    "For detailed analysis and live zones, visit:",
    website,
    "",
    "#StockMarket #TechnicalAnalysis #IndianStocks #FNONinja #TradingInsights",
  ].join("\n");

  const top = stocks.slice(0, 2);
  const youtubeTitle = [
    `${w} Levels Today:`,
    top.map((s) => `${s.symbol} ${levelLabel(s.levelType)} ${w}`).join(" | "),
    date,
  ].join(" ");

  const youtubeDescription = [
    `FNO Ninja observes ${wLower} building in key stocks:`,
    "",
    ...stocks.map(
      (s) => `• ${s.symbol} → ${levelLabel(s.levelType)} ${w} near ${s.price}`,
    ),
    "",
    `Data as of ${when}`,
    "",
    "Get full details and live zones here:",
    website,
    "",
    `#FNONinja #StockMarket #${w} #IndianStockMarket #shorts`,
  ].join("\n");

  const instagram = [
    "🚨 FNO Ninja Update",
    "",
    ...stocks.map(
      (s) =>
        `${s.symbol} → **${levelLabel(s.levelType)} ${w}** near ${s.price} ${s.levelType === "heavy" ? "💪" : "📈"}`,
    ),
    "",
    "Important levels to watch!",
    "",
    `📅 ${when}`,
    "",
    "Tap the link in bio for complete analysis & live zones 👆",
    website,
    "",
    `#FNONinja #StockMarket #${w} #TradingIndia #IndianStocks #MarketUpdate #TechnicalAnalysis #FNO`,
  ].join("\n");

  return { twitter, facebook, linkedin, youtubeTitle, youtubeDescription, instagram };
}

/**
 * Generate captions in two smaller Gemini calls (less truncation / JSON breakage),
 * falling back to templates if AI fails.
 */
export async function generateVideoCaptions(payload: CaptionPayload): Promise<VideoCaptionOutput> {
  const intro = promptIntro(payload);

  try {
    const [batchA, batchB] = await Promise.all([
      callGemini(
        `${intro}

Generate twitter, facebook, linkedin captions. Twitter max 280 chars if possible. Engaging, platform-native tone.`,
        { twitter: { type: "string" }, facebook: { type: "string" }, linkedin: { type: "string" } },
        ["twitter", "facebook", "linkedin"],
      ),
      callGemini(
        `${intro}

Generate youtubeTitle (<=90 chars), youtubeDescription, instagram captions.`,
        {
          youtubeTitle: { type: "string" },
          youtubeDescription: { type: "string" },
          instagram: { type: "string" },
        },
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
  } catch (aiErr) {
    console.warn("[generate-captions] AI failed, using template fallback:", aiErr);
    return buildTemplateCaptions(payload);
  }
}

/** Build payload from topic summary and generate all platform captions. */
export async function generateCaptionsFromSummary(summary: {
  variant: "put" | "call";
  dateLabel: string;
  generatedAtLabel: string | null;
  stocks: TopicStockSummary[];
}): Promise<VideoCaptionsForUi> {
  const payload = buildCaptionPayload(summary);
  const output = await generateVideoCaptions(payload);
  // Strip markdown / fix stray price line-breaks so captions are clean on every
  // network (none render markdown) — covers both AI and template fallback output.
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
