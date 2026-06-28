import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listChannels } from "@/lib/social/buffer";
import { platformForBufferService, SOCIAL_PLATFORMS } from "@/lib/social/platforms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/social/channels
 * Lists which of our platforms are connected in Buffer (and which aren't), so
 * the UI can show connection status and disable unconnected targets.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const channels = await listChannels();
    const connected = new Map<string, { id: string; name: string; service: string }>();
    for (const ch of channels) {
      const platform = platformForBufferService(ch.service);
      if (platform && !connected.has(platform)) {
        connected.set(platform, { id: ch.id, name: ch.name, service: ch.service });
      }
    }

    const platforms = SOCIAL_PLATFORMS.map((p) => ({
      id: p.id,
      label: p.label,
      connected: connected.has(p.id),
      channel: connected.get(p.id) ?? null,
      postBudget: p.postBudget,
      hardLimit: p.hardLimit,
    }));

    return NextResponse.json({ platforms, configured: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Buffer channels";
    // Most common cause: BUFFER_API_KEY missing — surface as not-configured, not a 500.
    const notConfigured = /not configured|BUFFER_API_KEY/i.test(msg);
    return NextResponse.json(
      { error: msg, configured: !notConfigured, platforms: SOCIAL_PLATFORMS.map((p) => ({ id: p.id, label: p.label, connected: false, channel: null, postBudget: p.postBudget, hardLimit: p.hardLimit })) },
      { status: notConfigured ? 200 : 500 },
    );
  }
}
