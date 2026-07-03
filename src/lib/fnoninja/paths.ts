import type { LearnArticleSlug } from "@/lib/fnoninja/learn-content";

/** Dedicated sign-in page. */
export function isFnoNinjaLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/fnoninja/login";
}

function fnoLoginBase(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/login";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/login";
  return "/login";
}

/** Sign-in page — optional ?next= same-origin path after OAuth. */
export function fnoLoginHref(pathname: string, returnTo?: string): string {
  const base = fnoLoginBase(pathname);
  if (!returnTo) return base;
  return `${base}?next=${encodeURIComponent(returnTo)}`;
}

/** Safe post-login destination from ?next= or default app home. */
export function resolveFnoLoginNext(
  searchParams: Pick<URLSearchParams, "get">,
  pathname: string,
): string {
  const raw = searchParams.get("next")?.trim();
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fnoAnalyticsHref(pathname);
}

/** Marketing home — no global symbol search in nav. Signed-in users are redirected to the app. */
export function isFnoNinjaLandingPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/fnoninja";
}

/** Levels app — default destination for signed-in users. */
export function fnoAppHref(pathname: string): string {
  return fnoAnalyticsHref(pathname);
}

/** Logo target — marketing home for guests, levels app for signed-in users. */
export function fnoProductHomeHref(pathname: string, signedIn: boolean): string {
  return signedIn ? fnoAppHref(pathname) : fnoHomeHref(pathname);
}

export function fnoHomeHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja";
  return "/";
}

/** Hash link to a marketing section — works from /levels and other subpages. */
export function fnoMarketingHash(pathname: string, hash: string): string {
  const home = fnoHomeHref(pathname);
  const onLanding =
    pathname === home ||
    pathname === "/fnoninja" ||
    (home === "/" && (pathname === "/" || pathname === "/fnoninja"));
  if (onLanding) return hash;
  return `${home}${hash}`;
}

/** Bubble chart with community chat panel opened (terms/subscription gates apply). */
export function fnoCommunityChatHref(pathname: string): string {
  return `${fnoAnalyticsHref(pathname)}?chat=1`;
}

/** Levels app — fnoninja.com uses /levels; local dev uses /fnoninja/levels. */
export function fnoAnalyticsHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/levels";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/levels";
  return "/fnoninja/levels";
}

/** Public /levels URL for the current host (embed + CTAs on fnoninja.com). */
export function fnoLevelsHrefForHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/levels";
  return "/fnoninja/levels";
}

/** Learn hub and article paths — fnoninja.com uses /learn; dev uses /fnoninja/learn. */
export function fnoLearnHref(pathname: string, slug?: LearnArticleSlug): string {
  let base = "/learn";
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") base = "/learn";
    else if (pathname.startsWith("/fnoninja")) base = "/fnoninja/learn";
  } else if (pathname.startsWith("/fnoninja")) {
    base = "/fnoninja/learn";
  }
  return slug ? `${base}/${slug}` : base;
}
