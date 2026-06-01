import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FREEDOMBOT_HOSTS = ["freedombot.ai", "www.freedombot.ai"];

// Pages that belong to the FreedomBot marketing site (rewritten to /freedombot/*)
const FREEDOMBOT_SITE_PATHS = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/records", "/dashboard", "/performance", "/methodology", "/levels"]);

function isFreedomBot(request: NextRequest): boolean {
  // Firebase App Hosting CDN may forward the original hostname in x-forwarded-host
  const forwarded = request.headers.get("x-forwarded-host") || "";
  const host = request.headers.get("host") || "";

  // Strip port and lowercase for comparison
  const candidates = [forwarded, host]
    .map((h) => h.split(":")[0].trim().toLowerCase())
    .filter(Boolean);

  return candidates.some((h) => FREEDOMBOT_HOSTS.includes(h));
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
