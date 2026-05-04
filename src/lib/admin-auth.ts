import { getAdminAuth } from "@/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

export const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

export type AdminAuthResult =
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; error: string; status: number };

export async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }
  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!ADMIN_EMAILS.has(decoded.email ?? "")) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
    return { ok: true, decoded };
  } catch {
    return { ok: false, error: "Unauthorized", status: 401 };
  }
}
