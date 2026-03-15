import { TwitterApi } from 'twitter-api-v2';
import { getAdminFirestore } from '@/firebase/admin';

const CONFIG_COLLECTION = 'twitter_config';
const CREDENTIALS_DOC = 'credentials';
const SETTINGS_DOC = 'settings';

export interface TwitterCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username: string;
  userId: string;
  connectedAt: string;
}

export interface TwitterSettings {
  watchlist: string[];
}

// ─── Authenticated Client ────────────────────────────────────────────

export async function getTwitterClient(): Promise<TwitterApi | null> {
  const db = getAdminFirestore();
  const doc = await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).get();

  if (!doc.exists) return null;

  const creds = doc.data() as TwitterCredentials;

  if (Date.now() >= creds.expiresAt - 60_000) {
    const refreshed = await refreshTokens(creds.refreshToken);
    if (!refreshed) return null;
    return new TwitterApi(refreshed.accessToken);
  }

  return new TwitterApi(creds.accessToken);
}

async function refreshTokens(currentRefreshToken: string): Promise<TwitterCredentials | null> {
  try {
    const requestClient = new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    });

    const { accessToken, refreshToken, expiresIn } =
      await requestClient.refreshOAuth2Token(currentRefreshToken);

    const db = getAdminFirestore();
    const doc = await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).get();
    const existing = doc.data() as TwitterCredentials;

    const updated: TwitterCredentials = {
      ...existing,
      accessToken,
      refreshToken: refreshToken!,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).set(updated);
    return updated;
  } catch (err) {
    console.error('[Twitter] Token refresh failed:', err);
    return null;
  }
}

// ─── OAuth 2.0 PKCE ─────────────────────────────────────────────────

export function generateAuthLink(callbackUrl: string) {
  const client = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID!,
    clientSecret: process.env.TWITTER_CLIENT_SECRET!,
  });

  return client.generateOAuth2AuthLink(callbackUrl, {
    scope: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'follows.read',
      'like.read',
      'offline.access',
    ],
  });
}

export async function handleOAuthCallback(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TwitterCredentials> {
  const client = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID!,
    clientSecret: process.env.TWITTER_CLIENT_SECRET!,
  });

  const { client: loggedClient, accessToken, refreshToken, expiresIn } =
    await client.loginWithOAuth2({ code, codeVerifier, redirectUri });

  const { data: me } = await loggedClient.v2.me();

  const credentials: TwitterCredentials = {
    accessToken,
    refreshToken: refreshToken!,
    expiresAt: Date.now() + expiresIn * 1000,
    username: me.username,
    userId: me.id,
    connectedAt: new Date().toISOString(),
  };

  const db = getAdminFirestore();
  await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).set(credentials);

  return credentials;
}

// ─── Connection Management ───────────────────────────────────────────

export async function getTwitterCredentials(): Promise<TwitterCredentials | null> {
  const db = getAdminFirestore();
  const doc = await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).get();
  if (!doc.exists) return null;
  return doc.data() as TwitterCredentials;
}

export async function disconnectTwitter(): Promise<void> {
  const db = getAdminFirestore();
  await db.collection(CONFIG_COLLECTION).doc(CREDENTIALS_DOC).delete();
}

// ─── Watchlist (Influencer Handles) ──────────────────────────────────

export async function getWatchlist(): Promise<string[]> {
  const db = getAdminFirestore();
  const doc = await db.collection(CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
  if (!doc.exists) return [];
  return (doc.data()?.watchlist as string[]) || [];
}

export async function updateWatchlist(handles: string[]): Promise<void> {
  const clean = handles
    .map((h) => h.replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(clean)];

  const db = getAdminFirestore();
  await db.collection(CONFIG_COLLECTION).doc(SETTINGS_DOC).set(
    { watchlist: unique },
    { merge: true },
  );
}

// ─── Scheduling Helpers ─────────────────────────────────────────────

/**
 * Sleep for a random duration within the given window.
 * Returns the actual delay in milliseconds.
 */
export async function randomDelay(windowMinutes: number = 15): Promise<number> {
  const delayMs = Math.floor(Math.random() * windowMinutes * 60 * 1000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return delayMs;
}

/**
 * Resolve the public origin from a request, handling Cloud Run's internal proxy.
 */
export function resolveOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedHost && !forwardedHost.includes('0.0.0.0') && !forwardedHost.includes('localhost')) {
    return `https://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
