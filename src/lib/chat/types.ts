/** Community chat shared types (client + server). */

/** A parsed mention inside a message. v1 supports symbol cashtags only. */
export interface ChatMention {
  type: "symbol";
  /** Uppercase symbol, e.g. "NIFTY" (without the leading $). */
  symbol: string;
}

/**
 * A chat message. The same shape is stored in both RTDB (live stream) and
 * Firestore (durable archive); `id` is shared across both stores.
 */
export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds of last edit, or null if never edited. */
  editedAt: number | null;
  deleted: boolean;
  deletedBy: "user" | "mod" | null;
  mentions: ChatMention[];
  /** Set when the pre-send filter flagged the message for moderator review. */
  flagged: boolean;
}

/**
 * Membership + access mirror for a user. Written server-side from the
 * subscription lifecycle; read by RTDB/Firestore rules to gate chat.
 */
export interface ChatMemberDoc {
  userId: string;
  /** True when the user's subscription is trial/active and not banned. */
  canChat: boolean;
  isBanned: boolean;
  banReason: string | null;
  /** ISO timestamp the user accepted the chat terms, or null. */
  acceptedTermsAt: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Recent post epoch-ms timestamps for sliding-window rate limiting. */
  recentPostTimes: number[];
  updatedAt: string;
}

export interface ChatReportDoc {
  roomId: string;
  messageId: string;
  reporterId: string;
  reason: string;
  messageText: string;
  messageAuthorId: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}
