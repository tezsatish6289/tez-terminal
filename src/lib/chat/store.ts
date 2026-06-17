/**
 * Server-side chat message store (Admin SDK).
 *
 * Dual-writes every mutation to:
 *   - RTDB   `rooms/{roomId}/messages/{id}`  — the live stream clients subscribe to
 *   - Firestore `chat_rooms/{roomId}/messages/{id}` — durable, searchable archive
 *
 * The message id is the RTDB push key, shared across both stores so edits and
 * deletes can target the same record in each.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDatabase, getAdminFirestore } from "@/firebase/admin";
import { deleteAttachmentObjects } from "@/lib/chat/image-upload";
import type { ChatAttachment, ChatMessage, ChatReplyRef } from "@/lib/chat/types";

function rtdbMsgRoot(roomId: string) {
  return getAdminDatabase().ref(`rooms/${roomId}/messages`);
}

function fsMsgCol(roomId: string) {
  return getAdminFirestore()
    .collection("chat_rooms")
    .doc(roomId)
    .collection("messages");
}

export interface CreateMessageInput {
  roomId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  mentions: ChatMessage["mentions"];
  flagged: boolean;
  attachments?: ChatAttachment[];
  replyTo?: ChatReplyRef;
}

export async function createMessage(input: CreateMessageInput): Promise<ChatMessage> {
  const ref = rtdbMsgRoot(input.roomId).push();
  const id = ref.key as string;
  const createdAt = Date.now();

  const message: ChatMessage = {
    id,
    roomId: input.roomId,
    authorId: input.authorId,
    authorName: input.authorName,
    authorPhoto: input.authorPhoto,
    text: input.text,
    createdAt,
    editedAt: null,
    deleted: false,
    deletedBy: null,
    mentions: input.mentions,
    flagged: input.flagged,
    // RTDB rejects `undefined`; only include optional fields when present.
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  };

  await ref.set(message);

  await fsMsgCol(input.roomId).doc(id).set(message);

  // Room metadata (best-effort) for ordering room lists / unread later.
  await Promise.all([
    getAdminDatabase().ref(`rooms/${input.roomId}/meta`).update({ lastMessageAt: createdAt }),
    getAdminFirestore()
      .collection("chat_rooms")
      .doc(input.roomId)
      .set(
        { roomId: input.roomId, lastMessageAt: createdAt, messageCount: FieldValue.increment(1) },
        { merge: true },
      ),
  ]).catch((e) => console.error("[chat] room meta update failed", e));

  return message;
}

export async function getMessage(
  roomId: string,
  id: string,
): Promise<ChatMessage | null> {
  const snap = await fsMsgCol(roomId).doc(id).get();
  return snap.exists ? (snap.data() as ChatMessage) : null;
}

export async function editMessage(
  roomId: string,
  id: string,
  patch: { text: string; mentions: ChatMessage["mentions"]; flagged: boolean },
): Promise<void> {
  const editedAt = Date.now();
  const update = { text: patch.text, mentions: patch.mentions, flagged: patch.flagged, editedAt };
  await Promise.all([
    rtdbMsgRoot(roomId).child(id).update(update),
    fsMsgCol(roomId).doc(id).update(update),
  ]);
}

export async function softDeleteMessage(
  roomId: string,
  id: string,
  by: "user" | "mod",
): Promise<void> {
  // A removed message must not leave its image reachable, so delete the Storage
  // objects. Firestore keeps the original attachment metadata for audit.
  const existing = await getMessage(roomId, id);
  await deleteAttachmentObjects(existing?.attachments);

  // Live stream: blank the visible content. Firestore: keep the original text
  // in an audit field for moderation/dispute history.
  await Promise.all([
    rtdbMsgRoot(roomId)
      .child(id)
      .update({ deleted: true, deletedBy: by, text: "", mentions: [], attachments: null }),
    fsMsgCol(roomId)
      .doc(id)
      .update({ deleted: true, deletedBy: by, deletedAt: Date.now() }),
  ]);
}

export async function hardDeleteMessage(roomId: string, id: string): Promise<void> {
  const existing = await getMessage(roomId, id);
  await deleteAttachmentObjects(existing?.attachments);

  await Promise.all([
    rtdbMsgRoot(roomId).child(id).remove(),
    fsMsgCol(roomId).doc(id).update({ deleted: true, deletedBy: "mod", hardDeletedAt: Date.now() }),
  ]);
}
