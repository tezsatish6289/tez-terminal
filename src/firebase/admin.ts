import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _db: Firestore | null = null;

/**
 * Returns a Firestore instance using the Admin SDK (bypasses security rules).
 * On Firebase App Hosting / Cloud Run, uses Application Default Credentials automatically.
 */
export function getAdminFirestore(): Firestore {
  if (!_db) {
    const app: App = getApps().length === 0 ? initializeApp() : getApps()[0];
    _db = getFirestore(app);
  }
  return _db;
}
