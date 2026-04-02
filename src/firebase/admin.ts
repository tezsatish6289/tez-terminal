import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _db: Firestore | null = null;
let _auth: Auth | null = null;

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

export function getAdminAuth(): Auth {
  if (!_auth) {
    const app: App = getApps().length === 0 ? initializeApp() : getApps()[0];
    _auth = getAuth(app);
  }
  return _auth;
}
