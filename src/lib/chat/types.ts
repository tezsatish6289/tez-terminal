/** Community chat shared types (client + server). */

/** A parsed `$SYMBOL` cashtag mention. */
export interface ChatSymbolMention {
  type: "symbol";
  /** Uppercase symbol, e.g. "NIFTY" (without the leading $). */
  symbol: string;
}

/** A parsed `@handle` user mention (handle is the inserted token, no spaces). */
export interface ChatUserMention {
  type: "user";
  /** Mention handle as written, without the leading @ (e.g. "Satish"). */
  handle: string;
}

/** A parsed mention inside a message — a symbol cashtag or a user handle. */
export type ChatMention = ChatSymbolMention | ChatUserMention;

/**
 * An image attachment on a chat message (e.g. a shared screenshot). Images are
 * uploaded server-side, re-encoded to strip metadata, and stored in Cloud
 * Storage; this is the authoritative metadata persisted alongside the message.
 */
export interface ChatAttachment {
  /** Storage object path, e.g. `chat/{roomId}/{uid}/{id}.webp`. */
  path: string;
  /** Tokenized Firebase download URL for rendering. */
  url: string;
  /** Always an image mime type (we re-encode to a single canonical format). */
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * A snapshot of the message being replied to, captured server-side at send time
 * so the quote renders without a lookup and survives the original being edited
 * or deleted.
 */
export interface ChatReplyRef {
  /** Id of the original message (for scroll-to / context). */
  id: string;
  authorName: string;
  /** Truncated text snippet of the original (empty if it was image-only). */
  text: string;
  /** True if the original had image attachments. */
  hasImage: boolean;
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
  /** Image attachments (shared screenshots). Omitted when there are none. */
  attachments?: ChatAttachment[];
  /** Set when this message is a reply to another message. */
  replyTo?: ChatReplyRef;
  /**
   * Client-only optimistic send state for outgoing messages (uploading in the
   * background). Never written to RTDB/Firestore. When set, attachment URLs are
   * local blob previews and the message is rendered with sending/retry UI.
   */
  clientStatus?: "sending" | "failed";
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
