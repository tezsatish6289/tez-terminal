/**
 * YouTube Live — create a scheduled broadcast for a webinar session so viewers
 * can "Set reminder" and the calendar/join links can point at a real watch URL.
 *
 * Uses the `youtube.force-ssl` scope. Creating a broadcast does NOT bind a stream
 * key — that's the streaming worker's job at go-live time. This just schedules the
 * upcoming live event on the channel.
 */
import { googlePost } from "./oauth";
import {
  WEBINAR_DESCRIPTION,
  WEBINAR_JOIN_URL,
  WEBINAR_TITLE,
  type WebinarSession,
} from "@/lib/fnoninja/webinar";

export interface ScheduledBroadcast {
  id: string;
  watchUrl: string;
}

export function youtubeWatchUrl(broadcastId: string): string {
  return `https://www.youtube.com/watch?v=${broadcastId}`;
}

/** Creates a public scheduled live broadcast for the session. Returns id + watch URL. */
export async function createScheduledBroadcast(
  accessToken: string,
  session: WebinarSession,
): Promise<ScheduledBroadcast> {
  const body = {
    snippet: {
      title: WEBINAR_TITLE,
      description: `${WEBINAR_DESCRIPTION}\n\nMore: ${WEBINAR_JOIN_URL}`,
      scheduledStartTime: session.start.toISOString(),
      scheduledEndTime: session.end.toISOString(),
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
    contentDetails: {
      enableAutoStart: false,
      enableAutoStop: false,
      latencyPreference: "normal",
    },
  };

  const data = await googlePost<{ id: string }>(
    accessToken,
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
    body,
  );

  return { id: data.id, watchUrl: youtubeWatchUrl(data.id) };
}
