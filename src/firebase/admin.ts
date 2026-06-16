import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getDatabaseWithUrl, type Database } from "firebase-admin/database";

let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _rtdb: Database | null = null;

const ADMIN_PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "studio-6235588950-a15f2";

/**
 * Shared Admin app. On App Hosting / Cloud Run the project id is inferred from
 * ADC, but locally it often isn't ("Unable to detect a Project Id"), so we pass
 * it explicitly. Credentials still come from ADC in both environments.
 */
function getAdminApp(): App {
  return getApps().length === 0
    ? initializeApp({ projectId: ADMIN_PROJECT_ID })
    : getApps()[0];
}

/**
 * Returns a Firestore instance using the Admin SDK (bypasses security rules).
 * On Firebase App Hosting / Cloud Run, uses Application Default Credentials automatically.
 *
 * We enable `ignoreUndefinedProperties` so that any optional field set to
 * `undefined` is dropped silently instead of throwing
 *   "Value for argument 'data' is not a valid Firestore value.
 *    Cannot use 'undefined' as a Firestore value."
 *
 * This bit us hard with the BTC zone bot: it called `openTrade()` with
 * `scoreBreakdown: undefined` (because the zone bot has no pattern scoring),
 * which put `scoreBreakdownAtEntry: undefined` on the resulting SimTrade.
 * The `simulator_trades.doc(...).set(tradeWithSource)` then threw, the error
 * bubbled up to `tickAsset`'s try/catch which only `console.error`'d it, so
 * `simulator_logs` got nothing and the bot looked dead for ~30 minutes.
 *
 * Enabling this flag once at the SDK level is the safest fix — it covers
 * every write path in the app (not just the zone bot) and is the recommended
 * Firebase pattern for permissive serialization of optional fields.
 */
export function getAdminFirestore(): Firestore {
  if (!_db) {
    _db = getFirestore(getAdminApp());
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getAdminApp());
  }
  return _auth;
}

/**
 * Returns a Realtime Database instance using the Admin SDK (bypasses rules).
 *
 * The Admin SDK needs the RTDB URL explicitly. On App Hosting / Cloud Run it is
 * not inferred from ADC, so we read it from env (falling back to the public
 * client URL, then the project's default-rtdb form). Community chat uses RTDB
 * for the live message stream + presence; durable history lives in Firestore.
 */
export function getAdminDatabase(): Database {
  if (!_rtdb) {
    const app: App = getAdminApp();
    const databaseURL =
      process.env.FIREBASE_DATABASE_URL ||
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
      "https://studio-6235588950-a15f2-default-rtdb.asia-southeast1.firebasedatabase.app";
    _rtdb = getDatabaseWithUrl(databaseURL, app);
  }
  return _rtdb;
}
