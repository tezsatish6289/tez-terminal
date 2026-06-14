const STORAGE_KEY = "fno_post_login_href";

/** Remember where to send the user after Google sign-in (e.g. landing header → bubbles). */
export function setFnoPostLoginRedirect(href: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, href);
}

/** Read and clear a pending post-login redirect. */
export function consumeFnoPostLoginRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const href = sessionStorage.getItem(STORAGE_KEY);
  if (href) sessionStorage.removeItem(STORAGE_KEY);
  return href;
}
