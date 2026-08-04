/**
 * Atlas welcome copy + identity helpers (client + server safe).
 * The post itself is sent from `send-atlas-welcome.ts` on terms accept.
 */

import { toMentionHandle } from "@/lib/chat/moderation";

export const ATLAS_SYSTEM_AUTHOR_ID = "system:atlas";
export const ATLAS_AUTHOR_NAME = "Atlas";
/** Absolute avatar URL stored on messages (matches public/fnoninja/atlas-agent.webp). */
export const ATLAS_AUTHOR_PHOTO = "https://fnoninja.com/fnoninja/atlas-agent.webp";
/** Same asset via site-relative path for client rendering. */
export const ATLAS_AUTHOR_PHOTO_LOCAL = "/fnoninja/atlas-agent.webp";

export function isAtlasSystemAuthor(authorId: string): boolean {
  return authorId === ATLAS_SYSTEM_AUTHOR_ID;
}

/**
 * Best-effort @handle for the welcome. Prefer Google display first name; else
 * a clean email local-part token. Returns null when nothing looks human enough
 * to @-mention (better than a junk handle).
 */
export function resolveWelcomeHandle(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  if (typeof displayName === "string" && displayName.trim()) {
    const handle = toMentionHandle(displayName);
    if (isUsableHandle(handle)) return handle;
  }

  if (typeof email === "string" && email.includes("@")) {
    const local = email.split("@")[0]?.trim() ?? "";
    const token = local.split(/[._+-]/)[0] ?? "";
    const handle = toMentionHandle(token);
    if (isUsableHandle(handle)) return handle;
  }

  return null;
}

function isUsableHandle(handle: string): boolean {
  if (handle.length < 2 || handle.length > 30) return false;
  // Pure digit / random-looking locals — skip.
  if (/^\d+$/.test(handle)) return false;
  if (/^[a-z]+\d{6,}$/i.test(handle)) return false;
  return true;
}

export function buildAtlasWelcomeText(handle: string | null): string {
  const lines: string[] = [];
  if (handle) lines.push(`Hello @${handle}`);
  lines.push("Welcome to FNO Ninja — this is where we learn market structure together.");
  lines.push(
    "Drop a quick intro: who you are, how long you’ve traded F&O, and your favorite index.",
  );
  return lines.join("\n");
}
