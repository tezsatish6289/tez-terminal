/** Client-side helpers to call the chat API with the user's Firebase ID token. */

import type { User } from "firebase/auth";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";

async function authedFetch(
  user: User,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const idToken = await user.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });
}

/** Like authedFetch but for multipart bodies (lets the browser set the boundary). */
async function authedUpload(user: User, url: string, body: FormData): Promise<Response> {
  const idToken = await user.getIdToken();
  return fetch(url, {
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Upload a single image to a room; returns its stored attachment metadata. */
export async function uploadChatImage(
  user: User,
  roomId: string,
  file: File,
): Promise<ChatAttachment> {
  const form = new FormData();
  form.append("roomId", roomId);
  form.append("file", file);
  const res = await authedUpload(user, "/api/chat/upload", form);
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.attachment as ChatAttachment;
}

export async function sendChatMessage(
  user: User,
  roomId: string,
  text: string,
  attachmentPaths: string[] = [],
  replyToId?: string,
): Promise<ChatMessage> {
  const res = await authedFetch(user, "/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ roomId, text, attachmentPaths, replyToId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.message as ChatMessage;
}

export async function editChatMessage(
  user: User,
  roomId: string,
  id: string,
  text: string,
): Promise<void> {
  const res = await authedFetch(
    user,
    `/api/chat/message/${id}?roomId=${encodeURIComponent(roomId)}`,
    { method: "PATCH", body: JSON.stringify({ text }) },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteChatMessage(
  user: User,
  roomId: string,
  id: string,
): Promise<void> {
  const res = await authedFetch(
    user,
    `/api/chat/message/${id}?roomId=${encodeURIComponent(roomId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function reportChatMessage(
  user: User,
  roomId: string,
  messageId: string,
  reason: string,
): Promise<void> {
  const res = await authedFetch(user, "/api/chat/report", {
    method: "POST",
    body: JSON.stringify({ roomId, messageId, reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
