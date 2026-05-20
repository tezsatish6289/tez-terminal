/**
 * Client-safe admin email allowlist (no firebase-admin imports).
 * Server routes use requireAdmin(); UI gates use isAdminEmail().
 */
export const SUPER_ADMIN_EMAIL = "hello@tezterminal.com";

export const ADMIN_EMAILS = new Set([SUPER_ADMIN_EMAIL]);

export function isAdminEmail(email: string | null | undefined): boolean {
  return email != null && ADMIN_EMAILS.has(email);
}
