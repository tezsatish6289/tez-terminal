import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { runTrialLifecycleEmails } from "@/lib/fnoninja/trial-lifecycle-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * GET /api/cron/fnoninja-trial-lifecycle?key=CRON_SECRET
 * Sends day 0 / 2 / 5 / 6 trial lifecycle emails (Resend transactional).
 * Schedule daily via cron-job.org (e.g. 9:00 IST).
 */
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTrialLifecycleEmails(getAdminFirestore());
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    console.error("[Trial Lifecycle Cron]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
