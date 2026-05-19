/**
 * One-time RBAC seed.
 *
 * Writes:
 *   admin_roles/super_admin              → role definition (permissions: ["*"])
 *   admin_user_roles/{SUPER_ADMIN_UID}   → assigns super_admin to you
 *
 * This is belt-and-suspenders alongside the hardcoded SUPER_ADMIN_EMAIL
 * fallback in src/lib/admin-auth.ts. The hardcoded path works even if this
 * seed never runs, so you cannot lock yourself out.
 *
 * Usage:
 *   1. Look up your Firebase UID (Firebase Console → Authentication → Users)
 *   2. Set the env var SUPER_ADMIN_UID, then run:
 *        SUPER_ADMIN_UID=xxxxxxxx npx tsx scripts/seed-admin-rbac.ts
 *
 * Re-run safely — uses `set({ merge: true })` so it's idempotent.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "studio-6235588950-a15f2";
const SUPER_ADMIN_EMAIL = "hello@tezterminal.com";

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID?.trim();
if (!SUPER_ADMIN_UID) {
  console.error(
    "ERROR: Set SUPER_ADMIN_UID env var.\n" +
      "Find it in Firebase Console → Authentication → Users (column 'User UID').\n" +
      "Example:\n" +
      "  SUPER_ADMIN_UID=abc123… npx tsx scripts/seed-admin-rbac.ts",
  );
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

async function seed() {
  const now = new Date().toISOString();

  await db.collection("admin_roles").doc("super_admin").set(
    {
      roleId: "super_admin",
      name: "Super Admin",
      description: "Full unrestricted access. Reserved for the account owner.",
      permissions: ["*"],
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  console.log("[seed] admin_roles/super_admin written");

  await db.collection("admin_user_roles").doc(SUPER_ADMIN_UID!).set(
    {
      uid: SUPER_ADMIN_UID,
      email: SUPER_ADMIN_EMAIL,
      roleIds: ["super_admin"],
      customPermissions: [],
      resolvedPermissions: ["*"],
      enabled: true,
      assignedAt: now,
      assignedBy: "seed-script",
      updatedAt: now,
    },
    { merge: true },
  );
  console.log(`[seed] admin_user_roles/${SUPER_ADMIN_UID} written`);

  console.log("\nDone. The hardcoded email fallback is still in place too —");
  console.log("if this seed is ever wiped, hello@tezterminal.com still gets in.");
}

seed().catch((e) => {
  console.error("[seed] failed", e);
  process.exit(1);
});
