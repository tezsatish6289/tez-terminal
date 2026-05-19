import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

/**
 * Hardcoded escape hatch — this email always passes, even if Firestore is
 * unreachable, the admin_user_roles doc is missing/corrupt, or the new
 * Firestore-backed RBAC system has a bug. Never remove without first
 * ensuring the requesting user has another path to super-admin access.
 */
const SUPER_ADMIN_EMAIL = "hello@tezterminal.com";

// Legacy constant — kept for the client-side UI gates that still import it
// (admin pages and simulator components). Those checks are cosmetic (decide
// which menu items to render); the real security is server-side via
// requireAdmin() below. New server code should NOT read this directly.
export const ADMIN_EMAILS = new Set([SUPER_ADMIN_EMAIL]);

export type AdminAuthResult =
  | { ok: true; decoded: DecodedIdToken; permissions: string[] }
  | { ok: false; error: string; status: number };

/**
 * Verify a Firebase ID token and check the caller is an admin.
 *
 * - `requireAdmin(request)` — caller must be in `admin_user_roles` and enabled
 *   (or be the super-admin). Use this for routes where "any admin can do this".
 * - `requireAdmin(request, "engage.send")` — caller must additionally hold the
 *   given permission string. Use this for fine-grained gates on individual
 *   actions (sending campaigns, refunding payments, etc.).
 *
 * Permission resolution order:
 *   1. SUPER_ADMIN_EMAIL → always allowed, permissions = ["*"].
 *   2. `admin_user_roles/{uid}.resolvedPermissions` — flat string array.
 *      Wildcard "*" matches any required permission.
 *   3. If lookup fails or doc is missing/disabled → 403.
 *
 * The seed script (`scripts/seed-admin-rbac.ts`) writes the super-admin's
 * user_roles doc so the path beyond the hardcoded fallback is also valid.
 */
export async function requireAdmin(
  request: NextRequest,
  permission?: string,
): Promise<AdminAuthResult> {
  const idToken = (request.headers.get("Authorization") ?? "")
    .replace("Bearer ", "")
    .trim();
  if (!idToken) return { ok: false, error: "Unauthorized", status: 401 };

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  if (decoded.email === SUPER_ADMIN_EMAIL) {
    return { ok: true, decoded, permissions: ["*"] };
  }

  let permissions: string[] = [];
  try {
    const doc = await getAdminFirestore()
      .collection("admin_user_roles")
      .doc(decoded.uid)
      .get();
    const data = doc.data();
    if (!data || data.enabled === false) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
    permissions = Array.isArray(data.resolvedPermissions)
      ? (data.resolvedPermissions as string[])
      : [];
  } catch (e) {
    console.error("[requireAdmin] admin_user_roles lookup failed", e);
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (permission && !permissions.includes(permission) && !permissions.includes("*")) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  return { ok: true, decoded, permissions };
}
