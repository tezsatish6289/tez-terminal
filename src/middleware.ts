import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FREEDOMBOT_HOSTS = ["freedombot.ai", "www.freedombot.ai"];
const FNONINJA_HOSTS = ["fnoninja.com", "www.fnoninja.com"];

// Pages that belong to the FreedomBot marketing site (rewritten to /freedombot/*)
const FREEDOMBOT_SITE_PATHS = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/records", "/dashboard", "/performance", "/methodology", "/levels"]);

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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isFnoNinja(request)) {
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.match(/\..+$/)
    ) {
      return NextResponse.next();
    }

    // Analytics app (shared levels engine)
    if (pathname === "/levels" || pathname.startsWith("/levels/")) {
      return NextResponse.rewrite(new URL(`/freedombot${pathname}`, request.url));
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
