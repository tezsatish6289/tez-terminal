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

/**
 * Sign-in page — optional ?next= same-origin path after OAuth, plus optional
 * sign_up-collection attribution (?src / ?cta) so the login page can stamp the
 * originating CTA onto the sign_up/login event.
 */
export function fnoLoginHref(
  pathname: string,
  returnTo?: string,
  opts?: { src?: string; cta?: string },
): string {
  const base = fnoLoginBase(pathname);
  const params = new URLSearchParams();
  if (returnTo) params.set("next", returnTo);
  if (opts?.src) params.set("src", opts.src);
  if (opts?.cta) params.set("cta", opts.cta);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
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

/** Guest community landing — benefits + blurred chat preview before sign-in. */
export function fnoCommunityHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/community";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/community";
  return "/fnoninja/community";
}

/** Liveslide slideshow on the levels app — sticky `?view=` so refresh restores it. */
export function fnoLiveslideHref(pathname: string): string {
  return `${fnoAnalyticsHref(pathname)}?view=liveslide`;
}

/** Favslide slideshow on the levels app — sticky `?view=` so refresh restores it. */
export function fnoFavslideHref(pathname: string): string {
  return `${fnoAnalyticsHref(pathname)}?view=favslide`;
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

/** Subscribe / membership page — fnoninja.com uses /subscribe; dev uses /fnoninja/subscribe. */
export function fnoSubscribeHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/subscribe";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/subscribe";
  return "/fnoninja/subscribe";
}

/** My Subscription (account) page — fnoninja.com uses /my-subscription; dev uses /fnoninja/my-subscription. */
export function fnoMySubscriptionHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/my-subscription";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/my-subscription";
  return "/fnoninja/my-subscription";
}

/** Refer & Earn affiliate dashboard. */
export function fnoAffiliateHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/affiliate";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/affiliate";
  return "/fnoninja/affiliate";
}

/** Affiliate promotional materials / copy kit. */
export function fnoAffiliateMaterialsHref(pathname: string): string {
  return `${fnoAffiliateHref(pathname)}/materials`;
}

/** Webinar page path for current host/env. */
export function fnoWebinarHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/webinar";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/webinar";
  return "/webinar";
}
