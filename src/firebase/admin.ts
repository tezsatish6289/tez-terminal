import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let _db: Firestore | null = null;
let _auth: Auth | null = null;

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
    const app: App = getApps().length === 0 ? initializeApp() : getApps()[0];
    _db = getFirestore(app);
    _db.settings({ ignoreUndefinedProperties: true });
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
