/**
 * Recompute success-story headline % from the 15-min chart snapshot and patch
 * stored events + already-posted Success Stories chat messages.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getAdminDatabase } from "@/firebase/admin";
import { SUCCESS_STORIES_ROOM_ID } from "@/lib/chat/constants";
import {
  buildSuccessStoryChatText,
  parseSuccessStoryMessage,
} from "@/lib/chat/success-story-message";
import { editMessage, getMessage } from "@/lib/chat/store";
import { loadEventCandles } from "@/lib/sr-audit/candle-snapshot";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import { LIVE_SUCCESS_STORIES_RTDB_PATH } from "@/lib/sr-audit/publish-live-success-story";
import { mfePctFromStoryBars } from "@/lib/sr-audit/score-logic";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { findSuccessStories } from "@/lib/videos/success-story";

export interface RepairSuccessStoryMfeResult {
  scanned: number;
  updatedEvents: number;
  updatedChat: number;
  skipped: number;
  errors: string[];
  samples: Array<{
    id: string;
    symbol: string;
    before: number;
    after: number;
    chatUpdated: boolean;
  }>;
}

function nearlyEqual(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) <= eps;
}

async function patchChatMessage(opts: {
  chatMessageId: string;
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
  storyId: string;
}): Promise<boolean> {
  const existing = await getMessage(SUCCESS_STORIES_ROOM_ID, opts.chatMessageId);
  if (!existing || existing.deleted) return false;

  const storyUrl =
    parseSuccessStoryMessage(existing.text)?.storyUrl ??
    `https://fnoninja.com/levels?story=${encodeURIComponent(opts.storyId)}`;

  const text = buildSuccessStoryChatText({
    symbol: opts.symbol,
    label: opts.label,
    movePct: opts.movePct,
    side: opts.side,
    storyUrl,
  });

  if (text === existing.text) return false;

  await editMessage(SUCCESS_STORIES_ROOM_ID, opts.chatMessageId, {
    text,
    mentions: existing.mentions ?? [{ type: "symbol", symbol: opts.symbol }],
    flagged: existing.flagged ?? false,
  });
  return true;
}

async function findChatMessageIdForStory(
  db: Firestore,
  eventId: string,
): Promise<string | null> {
  const alertSnap = await getAdminDatabase()
    .ref(`${LIVE_SUCCESS_STORIES_RTDB_PATH}/${eventId}`)
    .get();
  const fromAlert = alertSnap.val()?.chatMessageId;
  if (typeof fromAlert === "string" && fromAlert) return fromAlert;

  // Fallback: scan recent Success Stories archive for this story URL.
  const snap = await db
    .collection("chat_rooms")
    .doc(SUCCESS_STORIES_ROOM_ID)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(300)
    .get();

  const needle = `story=${eventId}`;
  for (const doc of snap.docs) {
    const data = doc.data() as { text?: string; authorId?: string };
    if (data.authorId !== "system:success-stories") continue;
    if (String(data.text ?? "").includes(needle)) return doc.id;
  }
  return null;
}

/**
 * Rewrite maxFavorablePct from chart snapshot bars and update chat copy.
 */
export async function repairSuccessStoryMfe(
  db: Firestore,
  opts: { withinDays?: number; scanLimit?: number; dryRun?: boolean } = {},
): Promise<RepairSuccessStoryMfeResult> {
  const dryRun = opts.dryRun === true;
  const stories = await findSuccessStories(db, {
    withinDays: opts.withinDays ?? 365,
    scanLimit: opts.scanLimit ?? 500,
    requireSnapshot: true,
    order: "newest",
  });

  const result: RepairSuccessStoryMfeResult = {
    scanned: stories.length,
    updatedEvents: 0,
    updatedChat: 0,
    skipped: 0,
    errors: [],
    samples: [],
  };

  for (const story of stories) {
    try {
      const snapshot = await loadEventCandles(db, story.id);
      if (!snapshot?.bars?.length) {
        result.skipped += 1;
        continue;
      }

      const eventSnap = await db.collection(SR_ZONE_EVENTS_COLLECTION).doc(story.id).get();
      if (!eventSnap.exists) {
        result.skipped += 1;
        continue;
      }
      const event = eventSnap.data() as SrZoneEvent;
      const chartMfe = mfePctFromStoryBars(
        {
          side: event.side,
          entrySpot: snapshot.entrySpot ?? event.entrySpot,
          invalidation: snapshot.invalidation ?? event.invalidation ?? null,
          maxPain: snapshot.maxPain ?? event.maxPain ?? null,
          eventAt: event.eventAt,
        },
        snapshot.bars,
      );
      if (chartMfe == null || !Number.isFinite(chartMfe)) {
        result.skipped += 1;
        continue;
      }

      const before =
        typeof event.maxFavorablePct === "number" ? event.maxFavorablePct : story.movePct;
      const after = Number(chartMfe.toFixed(4));
      const eventNeedsUpdate = !nearlyEqual(before, after);

      let chatUpdated = false;
      const chatMessageId = await findChatMessageIdForStory(db, story.id);

      if (!dryRun) {
        if (eventNeedsUpdate) {
          await eventSnap.ref.set(
            {
              maxFavorablePct: after,
              mfeSource: "chart_snapshot",
              mfeRepairedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
          result.updatedEvents += 1;
        }

        await getAdminDatabase()
          .ref(`${LIVE_SUCCESS_STORIES_RTDB_PATH}/${story.id}`)
          .update({ movePct: Number(after.toFixed(2)) })
          .catch(() => undefined);

        if (chatMessageId) {
          chatUpdated = await patchChatMessage({
            chatMessageId,
            symbol: story.symbol,
            label: story.label,
            side: story.side,
            movePct: after,
            storyId: story.id,
          });
          if (chatUpdated) result.updatedChat += 1;
        }
      } else if (eventNeedsUpdate) {
        result.updatedEvents += 1;
      }

      if (!eventNeedsUpdate && !chatUpdated) {
        result.skipped += 1;
      }

      if (eventNeedsUpdate || chatUpdated) {
        result.samples.push({
          id: story.id,
          symbol: story.symbol,
          before: Number(before.toFixed(2)),
          after: Number(after.toFixed(2)),
          chatUpdated,
        });
      }
    } catch (e) {
      result.errors.push(
        `${story.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
