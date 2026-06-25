/**
 * Community chat shared constants.
 *
 * Rooms are defined here; the data model (room id everywhere) supports adding
 * more channels without migration. Users with chat access are auto-subscribed
 * to every room with `autoSubscribe: true`.
 */

import { isAdminEmail } from "@/lib/admin-emails-client";

export const ANNOUNCEMENTS_ROOM_ID = "announcements";
export const GENERAL_ROOM_ID = "general";
export const PNL_SCREENSHOTS_ROOM_ID = "pnl-screenshots";

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  /** When true, every chat-enabled user sees this room (no manual join). */
  autoSubscribe: boolean;
  /** When true, only admins may post. Everyone else can read. */
  adminOnlyPost: boolean;
  /** Placeholder shown in the composer for this room. */
  composerPlaceholder?: string;
}

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: GENERAL_ROOM_ID,
    name: "General",
    description:
      "Open discussion on F&O market structure. Observations only — not investment advice.",
    autoSubscribe: true,
    adminOnlyPost: false,
    composerPlaceholder: "Share an observation…",
  },
  {
    id: PNL_SCREENSHOTS_ROOM_ID,
    name: "PNL Screenshots",
    description: "Share your P&L screenshots and trade outcomes with the community.",
    autoSubscribe: true,
    adminOnlyPost: false,
    composerPlaceholder: "Drop a screenshot or caption…",
  },
  {
    id: ANNOUNCEMENTS_ROOM_ID,
    name: "New feature announcements",
    description: "Product updates and new features from the FNONINJA team.",
    autoSubscribe: true,
    adminOnlyPost: true,
  },
];

/** Rooms shown in the channel list for chat-enabled users. */
export const SUBSCRIBED_CHAT_ROOMS = CHAT_ROOMS.filter((r) => r.autoSubscribe);

export function isKnownRoom(roomId: string): boolean {
  return CHAT_ROOMS.some((r) => r.id === roomId);
}

export function getChatRoom(roomId: string): ChatRoom | undefined {
  return CHAT_ROOMS.find((r) => r.id === roomId);
}

/** Whether the given user may post (text or images) in this room. */
export function canUserPostInRoom(
  roomId: string,
  email: string | null | undefined,
): boolean {
  const room = getChatRoom(roomId);
  if (!room) return false;
  if (!room.adminOnlyPost) return true;
  return isAdminEmail(email);
}

/** How many of the most recent messages the live RTDB listener subscribes to. */
export const CHAT_LIVE_WINDOW = 50;

/**
 * Small live window the panel-closed unread tracker subscribes to. We only need
 * enough to render a capped "9+" badge, so this stays well under CHAT_LIVE_WINDOW.
 */
export const CHAT_UNREAD_WINDOW = 20;

/** Older history is paginated from Firestore in pages of this size. */
export const CHAT_HISTORY_PAGE = 50;

export const CHAT_MAX_MESSAGE_LENGTH = 2000;

/** Sliding-window rate limit: max messages per window per user. */
export const CHAT_RATE_LIMIT_COUNT = 10;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;

/** Authors can edit their own message for this long after posting. */
export const CHAT_EDIT_WINDOW_MS = 5 * 60_000;

/* ── Image attachments (shared screenshots) ──────────────────────────────── */

/** Max accepted upload size for a single image, before re-encoding. */
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Image input types we accept at upload (validated by magic bytes too). */
export const CHAT_IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp"] as const;

/** Longest edge after re-encode; larger images are downscaled. */
export const CHAT_IMAGE_MAX_DIMENSION = 1600;

/** Max images per message. */
export const CHAT_MAX_ATTACHMENTS = 4;

/** Max characters of the original message text kept in a reply quote snapshot. */
export const CHAT_REPLY_SNIPPET_LENGTH = 200;

/**
 * Stricter sliding-window rate limit for image uploads (per user). Images are
 * heavier and harder to moderate than text, so they get their own budget.
 */
export const CHAT_IMAGE_RATE_LIMIT_COUNT = 6;
export const CHAT_IMAGE_RATE_LIMIT_WINDOW_MS = 60_000;
