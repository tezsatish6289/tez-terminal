import { getAdminAuth } from "@/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

export type UserAuthResult =
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; error: string; status: number };

/**
 * Verify a Firebase ID token from the Authorization header and return the
 * decoded token. Use for routes that any signed-in user may call (chat send,
 * edit, delete, report). Authorization/gating beyond identity is handled by the
 * route (canChat, ban, ownership).
 */
export async function requireUser(request: NextRequest): Promise<UserAuthResult> {
  const idToken = (request.headers.get("Authorization") ?? "")
    .replace("Bearer ", "")
    .trim();
  if (!idToken) return { ok: false, error: "Unauthorized", status: 401 };

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { ok: true, decoded };
  } catch {
    return { ok: false, error: "Unauthorized", status: 401 };
  }
}
