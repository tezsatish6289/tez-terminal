'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
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

/** 
 * Initiate Google sign-in.
 * Returns the promise so the UI can handle loading/error states if needed.
 */
export async function initiateGoogleSignIn(authInstance: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  // Using await here specifically for the trigger so we can catch immediate blockages
  try {
    await signInWithPopup(authInstance, provider);
  } catch (error: any) {
    console.error("Google Sign-In Error:", error);
    // If it's a domain error, we want the error to be visible to the developer/admin
    if (error.code === 'auth/unauthorized-domain') {
      alert(`Domain Unauthorized: Please add '${window.location.hostname}' to Authorized Domains in Firebase Console.`);
    } else {
      throw error;
    }
  }
}

/** Sign out the current user (non-blocking). */
export function initiateSignOut(authInstance: Auth): void {
  signOut(authInstance).catch((error) => {
    console.error("Sign-Out Error:", error);
  });
}
