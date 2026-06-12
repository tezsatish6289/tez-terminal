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

/** tezterminal.com public URLs → fnoninja.com (localhost keeps /fnoninja for dev). */
/** Levels analytics moved to fnoninja.com — preserve path + query (e.g. /levels/chart?scope=…). */
function fnoninjaLevelsRedirect(request: NextRequest, pathname: string): NextResponse {
  let destPath = pathname;
  if (pathname === "/freedombot/levels" || pathname.startsWith("/freedombot/levels/")) {
    destPath = pathname.replace(/^\/freedombot\/levels/, "/levels") || "/levels";
  }
  const url = new URL(destPath, FNONINJA_PUBLIC_ORIGIN);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

function tezTerminalFnoNinjaRedirect(request: NextRequest, pathname: string): NextResponse | null {
  if (!isTezTerminal(request)) return null;

  if (pathname === "/fnoninja" || pathname.startsWith("/fnoninja/")) {
    return NextResponse.redirect(FNONINJA_PUBLIC_ORIGIN, 301);
  }

  if (pathname === "/freedombot/levels" || pathname.startsWith("/freedombot/levels/")) {
    const dest = pathname.replace(/^\/freedombot\/levels/, "/levels") || "/levels";
    return NextResponse.redirect(`${FNONINJA_PUBLIC_ORIGIN}${dest}`, 301);
  }

  return null;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const tezFnoRedirect = tezTerminalFnoNinjaRedirect(request, pathname);
  if (tezFnoRedirect) return tezFnoRedirect;

  if (isFnoNinja(request)) {
    if (pathname === "/favicon.ico") {
      return NextResponse.rewrite(new URL("/fnoninja/icon.svg", request.url));
    }

    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.match(/\..+$/)
    ) {
      return NextResponse.next();
    }

    // Marketing + legal pages — FNONINJA shell
    if (
      pathname === "/contact" ||
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname === "/levels" ||
      pathname.startsWith("/levels/")
    ) {
      return NextResponse.rewrite(new URL(`/fnoninja${pathname}`, request.url));
    }

    // Stale internal paths → same FNONINJA shell
    if (pathname === "/freedombot/levels" || pathname.startsWith("/freedombot/levels/")) {
      const dest = pathname.replace(/^\/freedombot\/levels/, "/fnoninja/levels") || "/fnoninja/levels";
      return NextResponse.rewrite(new URL(dest, request.url));
    }

    if (pathname === "/embed" || pathname.startsWith("/embed/")) {
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

  // TezTerminal: not for search/LLM discovery — consumer site is freedombot.ai
  if (pathname === "/robots.txt") {
    return NextResponse.rewrite(new URL("/tez-robots.txt", request.url));
  }
  if (pathname === "/llms.txt" || pathname === "/sitemap.xml") {
    return new NextResponse("Not found", { status: 404 });
  }

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
