import "server-only";

/**
 * Low-level Gemini REST helpers shared by the news pipeline. Mirrors the
 * fetch/key pattern in src/lib/videos/generate-captions.ts but adds:
 *   - geminiGroundedText: research with Google Search grounding (returns sources)
 *   - geminiJson: structured JSON output (per-platform captions, etc.)
 *   - geminiImage: image generation (returns PNG bytes) via gemini-2.5-flash-image
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const NEWS_TEXT_MODEL = "gemini-2.5-flash";
/** Stable "Nano Banana" image model. Search grounding is NOT supported here. */
export const NEWS_IMAGE_MODEL = "gemini-2.5-flash-image";

export function geminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error("Gemini API key not configured. Add GOOGLE_GENAI_API_KEY to the environment.");
  }
  return key.trim();
}

export interface GroundingSource {
  title: string;
  url: string;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> };
  finishReason?: string;
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  };
}

async function postGemini(model: string, body: unknown): Promise<{ candidates?: GeminiCandidate[] }> {
  const res = await fetch(`${BASE}/${model}:generateContent?key=${geminiApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }
  return (await res.json()) as { candidates?: GeminiCandidate[] };
}

/** Run a grounded (Google Search) prompt, returning the combined text + dedup'd sources. */
export async function geminiGroundedText(prompt: string): Promise<{ text: string; sources: GroundingSource[] }> {
  const data = await postGemini(NEWS_TEXT_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  });

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty research response — try again.");

  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, title: chunk.web?.title?.trim() || url });
  }
  return { text, sources };
}

/** Strip markdown fences and extract the outermost JSON object from Gemini text. */
function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text) as T;
  } catch {
    const repaired = text.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m) =>
      m.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\n"),
    );
    return JSON.parse(repaired) as T;
  }
}

/** Structured JSON generation with a response schema (no grounding). */
export async function geminiJson<T extends Record<string, unknown>>(
  prompt: string,
  schema: Record<string, unknown>,
  required: string[],
): Promise<T> {
  const data = await postGemini(NEWS_TEXT_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: { type: "object", properties: schema, required },
    },
  });
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response — try again.");
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("Gemini response was truncated — try again.");
  return parseJson<T>(text);
}

/** Generate an image, returning raw PNG/JPEG bytes (first inline image in the response). */
export async function geminiImage(prompt: string): Promise<Buffer> {
  const data = await postGemini(NEWS_IMAGE_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) throw new Error("Image model returned no image — try again or adjust the prompt.");
  return Buffer.from(img.data, "base64");
}
