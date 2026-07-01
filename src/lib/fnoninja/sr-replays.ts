import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { SOCIAL_POSTS_COLLECTION, type ChannelResult } from "@/lib/social/schedule";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { VIDEO_RENDERS_COLLECTION } from "@/lib/videos/cloud-render";
import type { SrReplayShort } from "@/lib/fnoninja/sr-replay-types";

type DraftReplay = {
  videoUrl: string;
  title: string;
  publishedAt: string;
};

function isLivePost(results: ChannelResult[] | undefined): boolean {
  return (results ?? []).some((r) => r.status === "posted" || r.status === "scheduled");
}

function buildTitle(label: string, event: Partial<SrZoneEvent> | undefined): string {
  if (label.trim()) return label.trim();
  const symbol = event?.symbol ?? "Story";
  const move = event?.maxFavorablePct ?? event?.finalPnlPct;
  const moveStr = move != null && Number.isFinite(move) ? `+${move.toFixed(1)}%` : "";
  if (event?.side === "resistance") {
    return `${symbol} Call-Wall Rejection: ${moveStr} Move to Max Pain`;
  }
  return `${symbol} Put-Wall Bounce: ${moveStr} Move to Max Pain`;
}

async function loadPublishedFromSocial(): Promise<Map<string, DraftReplay>> {
  const db = getAdminFirestore();
  const snap = await db.collection(SOCIAL_POSTS_COLLECTION).where("source", "==", "sr-audit").get();
  const map = new Map<string, DraftReplay>();

  for (const doc of snap.docs) {
    const d = doc.data() as {
      contentId?: string;
      contentLabel?: string;
      videoUrl?: string;
      createdAt?: string;
      results?: ChannelResult[];
    };
    if (!d.contentId || !d.videoUrl?.trim() || !isLivePost(d.results)) continue;

    const publishedAt = d.createdAt ?? "";
    const prev = map.get(d.contentId);
    if (!prev || publishedAt > prev.publishedAt) {
      map.set(d.contentId, {
        videoUrl: d.videoUrl.trim(),
        title: d.contentLabel ?? "",
        publishedAt,
      });
    }
  }

  return map;
}

async function mergeReadyRenders(map: Map<string, DraftReplay>): Promise<void> {
  const db = getAdminFirestore();
  const snap = await db.collection(VIDEO_RENDERS_COLLECTION).orderBy("createdAt", "desc").limit(200).get();

  for (const doc of snap.docs) {
    const d = doc.data() as {
      source?: string;
      status?: string;
      url?: string | null;
      topicId?: string;
      finishedAt?: string;
      createdAt?: string;
    };
    if (d.source !== "sr-audit" || d.status !== "ready" || !d.url?.trim() || !d.topicId) continue;
    if (map.has(d.topicId)) continue;

    map.set(d.topicId, {
      videoUrl: d.url.trim(),
      title: "",
      publishedAt: d.finishedAt ?? d.createdAt ?? "",
    });
  }
}

async function enrichEvents(ids: string[]): Promise<Map<string, SrZoneEvent>> {
  const out = new Map<string, SrZoneEvent>();
  if (ids.length === 0) return out;

  const db = getAdminFirestore();
  const refs = ids.map((id) => db.collection(SR_ZONE_EVENTS_COLLECTION).doc(id));
  const snaps = await db.getAll(...refs);

  for (const snap of snaps) {
    if (!snap.exists) continue;
    out.set(snap.id, snap.data() as SrZoneEvent);
  }
  return out;
}

/** Published SR-audit win-story shorts, newest first. */
export async function listSrReplayShorts(limit = 48): Promise<SrReplayShort[]> {
  const drafts = await loadPublishedFromSocial();
  await mergeReadyRenders(drafts);

  const sorted = [...drafts.entries()]
    .sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt))
    .slice(0, limit);

  const events = await enrichEvents(sorted.map(([id]) => id));

  return sorted.map(([id, draft]) => {
    const event = events.get(id);
    return {
      id,
      title: buildTitle(draft.title, event),
      videoUrl: draft.videoUrl,
      symbol: event?.symbol ?? id,
      label: event?.label ?? event?.symbol ?? id,
      side: event?.side === "resistance" ? "resistance" : "support",
      movePct: event?.maxFavorablePct ?? event?.finalPnlPct ?? null,
      publishedAt: draft.publishedAt,
    };
  });
}
