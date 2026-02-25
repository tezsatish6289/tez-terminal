'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance).catch((error) => {
    console.error("Anonymous Sign-In Error:", error);
  });
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  createUserWithEmailAndPassword(authInstance, email, password).catch((error) => {
    console.error("Email Sign-Up Error:", error);
  });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password).catch((error) => {
    console.error("Email Sign-In Error:", error);
  });
}

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/** Use redirect instead of popup (e.g. ?auth=redirect in URL). */
export function useRedirectAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.search.includes('auth=redirect');
}

/**
 * Initiate Google sign-in.
 * Uses popup by default (works with localhost when domain is authorized). Use ?auth=redirect to force redirect.
 */
export async function initiateGoogleSignIn(authInstance: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    if (isLocalhost() && useRedirectAuth()) {
      await signInWithRedirect(authInstance, provider);
      return;
    }
    await signInWithPopup(authInstance, provider);
  } catch (error: any) {
    console.error("Google Sign-In Error:", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert(`Domain Unauthorized: Add '${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}' in Firebase Console → Authentication → Settings → Authorized domains.`);
    } else if (error.code === 'auth/popup-blocked') {
      alert('Popup was blocked. Allow popups for this site or open http://localhost:9002?auth=redirect and sign in again.');
    } else {
      throw error;
    }
  }
}

/** Call on app load to complete a redirect sign-in and return the user. */
export async function handleRedirectResult(authInstance: Auth): Promise<boolean> {
  try {
    const result = await getRedirectResult(authInstance);
    if (result?.user) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[Auth] Redirect sign-in succeeded:', result.user.email);
      }
      return true;
    }
    return false;
  } catch (error: any) {
    console.error("Redirect result error:", error?.code, error?.message);
    if (error?.code === 'auth/unauthorized-domain') {
      alert(`Domain Unauthorized: Add 'localhost' in Firebase Console → Authentication → Settings → Authorized domains.`);
    }
    return false;
  }
}

/** Ensure auth state is persisted in the browser (call once on client init). */
export async function ensureAuthPersistence(authInstance: Auth): Promise<void> {
  try {
    await setPersistence(authInstance, browserLocalPersistence);
  } catch (e) {
    console.warn("Auth persistence could not be set:", e);
  }
}

/** Sign out the current user (non-blocking). */
export function initiateSignOut(authInstance: Auth): void {
  signOut(authInstance).catch((error) => {
    console.error("Sign-Out Error:", error);
  });
}
