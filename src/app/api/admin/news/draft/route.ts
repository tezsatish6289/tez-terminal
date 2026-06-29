import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { generateNewsDraft } from "@/lib/news/draft";

export const dynamic = "force-dynamic";
/** Grounded research + a structured caption pass — give it headroom. */
export const maxDuration = 120;

/**
 * POST /api/admin/news/draft  body: { prompt }
 * Researches the pasted news (Gemini + Google Search grounding) and returns a
 * headline, summary, sources, and per-platform captions for review.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let prompt: string;
  try {
    const body = await request.json();
    prompt = String(body?.prompt ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  try {
    const draft = await generateNewsDraft(prompt);
    return NextResponse.json({ draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Draft generation failed";
    console.error("[admin/news/draft]", msg);
    const lower = msg.toLowerCase();
    if (lower.includes("api key") || lower.includes("api_key")) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Add GOOGLE_GENAI_API_KEY to the environment.", code: "NO_API_KEY" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
