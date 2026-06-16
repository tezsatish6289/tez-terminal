/**
 * Community chat shared constants.
 *
 * v1 ships a single #general room. The data model (room id everywhere) is
 * designed so per-symbol rooms can be added on demand later without migration.
 */

export const GENERAL_ROOM_ID = "general";

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
}

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: GENERAL_ROOM_ID,
    name: "General",
    description:
      "Open discussion on F&O market structure. Observations only — not investment advice.",
  },
];

export function isKnownRoom(roomId: string): boolean {
  return CHAT_ROOMS.some((r) => r.id === roomId);
}

/** How many of the most recent messages the live RTDB listener subscribes to. */
export const CHAT_LIVE_WINDOW = 50;

/** Older history is paginated from Firestore in pages of this size. */
export const CHAT_HISTORY_PAGE = 50;

export const CHAT_MAX_MESSAGE_LENGTH = 2000;

/** Sliding-window rate limit: max messages per window per user. */
export const CHAT_RATE_LIMIT_COUNT = 10;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;

/** Authors can edit their own message for this long after posting. */
export const CHAT_EDIT_WINDOW_MS = 5 * 60_000;
