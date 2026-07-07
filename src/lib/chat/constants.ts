/**
 * Community chat shared constants.
 *
 * Rooms are defined here; the data model (room id everywhere) supports adding
 * more channels without migration. Users with chat access are auto-subscribed
 * to every room with `autoSubscribe: true`.
 */

import { isAdminEmail } from "@/lib/admin-emails-client";

export const GENERAL_ROOM_ID = "general";
export const CHARTS_ROOM_ID = "charts";
export const PNL_SCREENSHOTS_ROOM_ID = "pnl-screenshots";
export const OFFERS_ROOM_ID = "offers";
/** Stable id — existing announcement history lives under this room. */
export const ANNOUNCEMENTS_ROOM_ID = "announcements";

export interface ChatRoom {
  id: string;
  name: string;
  /** Short helper shown under the room header. */
  description: string;
  /** Channel rules shown in the Rules section. */
  rules: readonly string[];
  /** When true, every chat-enabled user sees this room (no manual join). */
  autoSubscribe: boolean;
  /** When true, only admins may post or reply. Everyone else can read and react. */
  adminOnlyPost: boolean;
  /** Placeholder shown in the composer for this room. */
  composerPlaceholder?: string;
}

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: GENERAL_ROOM_ID,
    name: "General",
    description:
      "Open discussion on F&O market structure, setups, and observations. Not investment advice.",
    rules: [
      "Stay on topic — F&O structure, levels, and market context.",
      "Observations only — no buy/sell calls or guaranteed returns.",
      "Be respectful; disagree without personal attacks.",
      "No spam, referral links, or unsolicited promotions.",
    ],
    autoSubscribe: true,
    adminOnlyPost: false,
    composerPlaceholder: "Share an observation…",
  },
  {
    id: CHARTS_ROOM_ID,
    name: "Charts",
    description:
      "Share chart screenshots, levels, and technical setups for community discussion.",
    rules: [
      "Charts and screenshots only — keep text brief (caption + context).",
      "Tag the symbol with $TICKER when relevant.",
      "Observations only — not investment advice.",
      "No unrelated memes or off-topic posts.",
    ],
    autoSubscribe: true,
    adminOnlyPost: false,
    composerPlaceholder: "Drop a chart or caption…",
  },
  {
    id: PNL_SCREENSHOTS_ROOM_ID,
    name: "PNL Screenshots",
    description:
      "Share P&L screenshots and trade outcomes. Learn from each other — don't copy blindly.",
    rules: [
      "P&L screenshots only — add a short caption if helpful.",
      "Blur account numbers or personal details if you prefer.",
      "No shaming others for losses.",
      "Past results are not guarantees of future performance.",
    ],
    autoSubscribe: true,
    adminOnlyPost: false,
    composerPlaceholder: "Drop a screenshot or caption…",
  },
  {
    id: OFFERS_ROOM_ID,
    name: "Offers",
    description:
      "Official offers, plans, and promotions from the FNONINJA team. React to show interest.",
    rules: [
      "Team posts only — members can read and react.",
      "Offers may be time-bound; check dates in each post.",
      "Questions about an offer → ask in General.",
      "Do not repost offer screenshots elsewhere without context.",
    ],
    autoSubscribe: true,
    adminOnlyPost: true,
  },
  {
    id: ANNOUNCEMENTS_ROOM_ID,
    name: "Announcements",
    description:
      "Product updates, new features, and important news from FNONINJA. React to acknowledge.",
    rules: [
      "Team posts only — members can read and react.",
      "Check here first for what's new on the platform.",
      "Feedback and bug reports → General or Contact.",
      "Do not reply with buy/sell tips or off-topic chatter.",
    ],
    autoSubscribe: true,
    adminOnlyPost: true,
  },
];

/** Emoji reactions members can toggle on any message. */
export const CHAT_QUICK_REACTIONS = ["👍", "🔥", "❤️", "👀", "🎉"] as const;

export type ChatQuickReaction = (typeof CHAT_QUICK_REACTIONS)[number];

/** Rooms shown in the channel list for chat-enabled users. */
export const SUBSCRIBED_CHAT_ROOMS = CHAT_ROOMS.filter((r) => r.autoSubscribe);

export function isKnownRoom(roomId: string): boolean {
  return CHAT_ROOMS.some((r) => r.id === roomId);
}

export function getChatRoom(roomId: string): ChatRoom | undefined {
  return CHAT_ROOMS.find((r) => r.id === roomId);
}

/** Whether the given user may post (text or images) or reply in this room. */
export function canUserPostInRoom(
  roomId: string,
  email: string | null | undefined,
): boolean {
  const room = getChatRoom(roomId);
  if (!room) return false;
  if (!room.adminOnlyPost) return true;
  return isAdminEmail(email);
}

/** Whether the given user may react to messages in this room. */
export function canUserReactInRoom(roomId: string): boolean {
  return isKnownRoom(roomId);
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
