import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { qualifySuccessStory } from "@/lib/videos/success-story";
import { generateStoryCaptionsFromCandidate } from "@/lib/sr-audit/generate-story-captions";

export const dynamic = "force-dynamic";
/** Caption generation calls Gemini; give it headroom. */
export const maxDuration = 120;

/**
 * POST /api/admin/sr-audit/captions  body: { storyId }
 * Generates per-platform captions for one success story (win reel).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let storyId: string;
  try {
    const body = await request.json();
    storyId = String(body?.storyId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!storyId) return NextResponse.json({ error: "storyId is required" }, { status: 400 });

  try {
    const db = getAdminFirestore();
    const snap = await db.collection(SR_ZONE_EVENTS_COLLECTION).doc(storyId).get();
    if (!snap.exists) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const candidate = qualifySuccessStory({ id: snap.id, ...(snap.data() as SrZoneEvent) });
    if (!candidate) {
      return NextResponse.json({ error: "This event isn't a qualifying win story." }, { status: 409 });
    }

    const captions = await generateStoryCaptionsFromCandidate(candidate);
    return NextResponse.json({ candidate, captions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Caption generation failed";
    console.error("[admin/sr-audit/captions]", msg);
    const lower = msg.toLowerCase();
    if (lower.includes("api key") || lower.includes("api_key") || lower.includes("failed_precondition")) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Add GOOGLE_GENAI_API_KEY to the environment.", code: "NO_API_KEY" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
