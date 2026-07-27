/**
 * In-app FOMO publish when an SR win first becomes replayable.
 * Writes RTDB live_alerts + Success Stories chat — independent of Buffer/video.
 */

import "server-only";
import { getAdminDatabase } from "@/firebase/admin";
import { createMessage } from "@/lib/chat/store";
import { SUCCESS_STORIES_ROOM_ID } from "@/lib/chat/constants";
import { buildSuccessStoryChatText } from "@/lib/chat/success-story-message";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";
import type { SrZoneEvent } from "@/lib/sr-audit/types";

export const LIVE_SUCCESS_STORIES_RTDB_PATH = "live_alerts/success_stories";

/** Same threshold as Buffer auto-posts (SR_BUFFER_AUTO_MIN_MOVE_PCT). */
export const SR_LIVE_MIN_MOVE_PCT = 3;

export interface LiveSuccessStoryAlert {
  eventId: string;
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
  at: string;
  chatMessageId?: string | null;
}

export interface PublishLiveSuccessStoryInput {
  eventId: string;
  event: Pick<SrZoneEvent, "symbol" | "label" | "side">;
  movePct: number;
}

export interface PublishLiveSuccessStoryResult {
  skipped?: string;
  alert?: LiveSuccessStoryAlert;
}

function alertRef(eventId: string) {
  return getAdminDatabase().ref(`${LIVE_SUCCESS_STORIES_RTDB_PATH}/${eventId}`);
}

export async function publishLiveSuccessStory(
  input: PublishLiveSuccessStoryInput,
): Promise<PublishLiveSuccessStoryResult> {
  const movePct = Number(input.movePct);
  if (!Number.isFinite(movePct) || !(movePct > SR_LIVE_MIN_MOVE_PCT)) {
    return { skipped: "move_pct_below_threshold" };
  }

  const symbol = (input.event.symbol || "").toUpperCase();
  const label = input.event.label || symbol;
  const side = input.event.side === "resistance" ? "resistance" : "support";
  const at = new Date().toISOString();

  const claim = await alertRef(input.eventId).transaction((current) => {
    if (current != null) return;
    return {
      eventId: input.eventId,
      symbol,
      label,
      side,
      movePct: Number(movePct.toFixed(2)),
      at,
      chatMessageId: null,
    } satisfies LiveSuccessStoryAlert;
  });

  if (!claim.committed) {
    return { skipped: "already_published" };
  }

  const replay = await loadStoryReplayPayload(input.eventId);
  if (!replay?.candles?.length) {
    await alertRef(input.eventId).remove().catch(() => undefined);
    return { skipped: "replay_not_ready" };
  }

  // Canonical MFE from the same qualify path the replay UI uses.
  const displayMovePct = Number.isFinite(replay.movePct) ? replay.movePct : movePct;
  if (!(displayMovePct > SR_LIVE_MIN_MOVE_PCT)) {
    await alertRef(input.eventId).remove().catch(() => undefined);
    return { skipped: "move_pct_below_threshold" };
  }

  const storyUrl = `${FNONINJA_SITE_URL}/levels?story=${encodeURIComponent(input.eventId)}`;
  const text = buildSuccessStoryChatText({
    symbol: symbol || replay.symbol,
    label: label || replay.label,
    movePct: displayMovePct,
    side,
    storyUrl,
  });

  let chatMessageId: string | null = null;
  try {
    const msg = await createMessage({
      roomId: SUCCESS_STORIES_ROOM_ID,
      authorId: "system:success-stories",
      authorName: "FNO Ninja",
      authorPhoto: null,
      text,
      mentions: [{ type: "symbol", symbol: (symbol || replay.symbol).toUpperCase() }],
      flagged: false,
    });
    chatMessageId = msg.id;
    await alertRef(input.eventId).update({
      chatMessageId,
      movePct: Number(displayMovePct.toFixed(2)),
    });
  } catch (e) {
    console.error(
      "[publish-live-success-story] chat post failed",
      e instanceof Error ? e.message : e,
    );
    await alertRef(input.eventId)
      .update({ movePct: Number(displayMovePct.toFixed(2)) })
      .catch(() => undefined);
  }

  const alert: LiveSuccessStoryAlert = {
    eventId: input.eventId,
    symbol: symbol || replay.symbol,
    label: label || replay.label,
    side,
    movePct: Number(displayMovePct.toFixed(2)),
    at,
    chatMessageId,
  };

  return { alert };
}
