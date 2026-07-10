import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FREEDOMBOT_HOSTS = ["freedombot.ai", "www.freedombot.ai"];
const FNONINJA_HOSTS = ["fnoninja.com", "www.fnoninja.com"];
const TEZTERMINAL_HOSTS = ["tezterminal.com", "www.tezterminal.com"];
const FNONINJA_PUBLIC_ORIGIN = "https://fnoninja.com";

// Pages that belong to the FreedomBot marketing site (rewritten to /freedombot/*)
const FREEDOMBOT_SITE_PATHS = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/records", "/dashboard", "/performance", "/methodology"]);

function hostCandidates(request: NextRequest): string[] {
  const forwarded = request.headers.get("x-forwarded-host") || "";
  const host = request.headers.get("host") || "";
  return [forwarded, host]
    .map((h) => h.split(":")[0].trim().toLowerCase())
    .filter(Boolean);
}

function isFreedomBot(request: NextRequest): boolean {
  return hostCandidates(request).some((h) => FREEDOMBOT_HOSTS.includes(h));
}

function isFnoNinja(request: NextRequest): boolean {
  return hostCandidates(request).some((h) => FNONINJA_HOSTS.includes(h));
}

function isTezTerminal(request: NextRequest): boolean {
  return hostCandidates(request).some((h) => TEZTERMINAL_HOSTS.includes(h));
}

/** tezterminal.com / localhost stale paths → fnoninja.com levels. */
function tezStaleLevelsRedirect(request: NextRequest, pathname: string): NextResponse | null {
  if (pathname !== "/freedombot/levels" && !pathname.startsWith("/freedombot/levels/")) {
    return null;
  }
  const dest = pathname.replace(/^\/freedombot\/levels/, "/levels") || "/levels";
  const url = new URL(dest, FNONINJA_PUBLIC_ORIGIN);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

/** Levels analytics live on fnoninja.com — redirect from freedombot.ai (or legacy paths). */
function fnoninjaLevelsRedirect(request: NextRequest, pathname: string): NextResponse {
  let destPath = pathname;
  if (pathname === "/freedombot/levels" || pathname.startsWith("/freedombot/levels/")) {
    destPath = pathname.replace(/^\/freedombot\/levels/, "/levels") || "/levels";
  }
  const url = new URL(destPath, FNONINJA_PUBLIC_ORIGIN);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

/** fnoninja.com legacy /freedombot/levels → public /levels on same host. */
function legacyFreedombotLevelsOnFnoNinjaRedirect(
  request: NextRequest,
  pathname: string,
): NextResponse | null {
  if (pathname !== "/freedombot/levels" && !pathname.startsWith("/freedombot/levels/")) {
    return null;
  }
  const dest = pathname.replace(/^\/freedombot\/levels/, "/levels") || "/levels";
  const url = new URL(dest, request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

/** localhost dev: legacy /freedombot/levels → /fnoninja/levels. */
function staleFreedombotLevelsRedirect(request: NextRequest, pathname: string): NextResponse | null {
  if (pathname !== "/freedombot/levels" && !pathname.startsWith("/freedombot/levels/")) {
    return null;
  }
  const dest = pathname.replace(/^\/freedombot\/levels/, "/fnoninja/levels") || "/fnoninja/levels";
  const url = new URL(dest, request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

function tezTerminalFnoNinjaRedirect(request: NextRequest, pathname: string): NextResponse | null {
  if (!isTezTerminal(request)) return null;

  if (pathname === "/fnoninja" || pathname.startsWith("/fnoninja/")) {
    return NextResponse.redirect(FNONINJA_PUBLIC_ORIGIN, 301);
  }

  return tezStaleLevelsRedirect(request, pathname);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const tezFnoRedirect = tezTerminalFnoNinjaRedirect(request, pathname);
  if (tezFnoRedirect) return tezFnoRedirect;

  if (isFnoNinja(request)) {
    if (pathname === "/favicon.ico") {
      return NextResponse.rewrite(new URL("/fnoninja/icon.svg", request.url));
    }

    // Crawler discovery — static only (host-specific; never share FreedomBot files)
    if (pathname === "/robots.txt") {
      return NextResponse.rewrite(new URL("/fnoninja/robots.txt", request.url));
    }
    if (pathname === "/sitemap.xml") {
      return NextResponse.rewrite(new URL("/fnoninja/sitemap.xml", request.url));
    }
    if (pathname === "/llms.txt") {
      return NextResponse.rewrite(new URL("/fnoninja/llms.txt", request.url));
    }

    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.match(/\..+$/)
    ) {
      return NextResponse.next();
    }

    // Social preview images — FNONINJA assets only
    if (pathname === "/opengraph-image" || pathname === "/twitter-image") {
      return NextResponse.rewrite(new URL(`/fnoninja${pathname}`, request.url));
    }

    // Marketing + legal pages — FNONINJA shell
    if (
      pathname === "/contact" ||
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname === "/learn" ||
      pathname.startsWith("/learn/") ||
      pathname === "/webinar" ||
      pathname.startsWith("/webinar/") ||
      pathname === "/community" ||
      pathname.startsWith("/community/") ||
      pathname === "/subscribe" ||
      pathname.startsWith("/subscribe/") ||
      pathname === "/my-subscription" ||
      pathname.startsWith("/my-subscription/") ||
      pathname === "/levels" ||
      pathname.startsWith("/levels/")
    ) {
      return NextResponse.rewrite(new URL(`/fnoninja${pathname}`, request.url));
    }

    // Legacy /freedombot/levels → public /levels on this host
    const staleLevels = legacyFreedombotLevelsOnFnoNinjaRedirect(request, pathname);
    if (staleLevels) return staleLevels;

    if (pathname === "/embed" || pathname.startsWith("/embed/")) {
      return NextResponse.next();
    }

    // YouTube live broadcast scene (captured by the nightly streamer).
    if (pathname === "/broadcast" || pathname.startsWith("/broadcast/")) {
      return NextResponse.next();
    }

    if (pathname === "/fnoninja" || pathname.startsWith("/fnoninja/")) {
      return NextResponse.next();
    }

    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/fnoninja", request.url));
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isFreedomBot(request)) {
    // Serve the FreedomBot icon for favicon requests on this domain
    if (pathname === "/favicon.ico") {
      return NextResponse.rewrite(new URL("/freedombot/icon.png", request.url));
    }

    // Crawler discovery — static only (never use dynamic robots.ts; host header is unreliable)
    if (pathname === "/robots.txt") {
      return NextResponse.rewrite(new URL("/freedombot/robots.txt", request.url));
    }
    if (pathname === "/sitemap.xml") {
      return NextResponse.rewrite(new URL("/freedombot/sitemap.xml", request.url));
    }
    // FreedomBot LLM discovery file (TezTerminal blocks /llms.txt)
    if (pathname === "/llms.txt") {
      return NextResponse.rewrite(new URL("/freedombot/llms.txt", request.url));
    }

    // Always pass through Next.js internals, static files, and API routes
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.match(/\..+$/)
    ) {
      return NextResponse.next();
    }

    // Social preview images — use FreedomBot assets, not root TezTerminal OG
    if (pathname === "/opengraph-image" || pathname === "/twitter-image") {
      return NextResponse.rewrite(new URL(`/freedombot${pathname}`, request.url));
    }

    // Levels analytics — deprecated on freedombot.ai; live on fnoninja.com
    if (
      pathname === "/levels" ||
      pathname.startsWith("/levels/") ||
      pathname === "/freedombot/levels" ||
      pathname.startsWith("/freedombot/levels/")
    ) {
      return fnoninjaLevelsRedirect(request, pathname);
    }

    // Already on internal /freedombot/* routes (e.g. mistaken links) — serve directly
    if (pathname === "/freedombot" || pathname.startsWith("/freedombot/")) {
      return NextResponse.next();
    }

    // Marketing site pages → rewrite to /freedombot/* internally
    if (FREEDOMBOT_SITE_PATHS.has(pathname) || pathname.startsWith("/dashboard/")) {
      const newPath =
        pathname === "/" ? "/freedombot" : `/freedombot${pathname}`;
      return NextResponse.rewrite(new URL(newPath, request.url));
    }

    // Any other path on freedombot.ai (e.g. /live, /purchases) → redirect to homepage
    return NextResponse.redirect(new URL("/", request.url));
  }

  // TezTerminal / localhost: internal tool — block search and LLM discovery
  if (pathname === "/robots.txt") {
    return NextResponse.rewrite(new URL("/tez-robots.txt", request.url));
  }
  if (pathname === "/llms.txt" || pathname === "/sitemap.xml") {
    return new NextResponse("Not found", { status: 404 });
  }

  const devStaleLevels = staleFreedombotLevelsRedirect(request, pathname);
  if (devStaleLevels) return devStaleLevels;

  const response = NextResponse.next();
  if (
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.match(/\..+$/)
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
