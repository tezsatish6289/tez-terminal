import { getAdminFirestore } from "@/firebase/admin";

const COLLECTION = "webinarRegistrations";

/** Total webinar form submissions across all sessions (same source as admin webinars page). */
export async function getWebinarRegistrationTotal(): Promise<number> {
  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTION).count().get();
    return snap.data().count;
  } catch (error) {
    console.error("[webinar-stats] failed to count registrations:", error);
    return 0;
  }
}
