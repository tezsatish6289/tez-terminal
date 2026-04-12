import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FREEDOMBOT_HOSTS = ["freedombot.ai", "www.freedombot.ai"];

// Pages that belong to the FreedomBot marketing site (rewritten to /freedombot/*)
const FREEDOMBOT_SITE_PATHS = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/records", "/dashboard", "/performance"]);

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
    // Always pass through Next.js internals, static files, and API routes
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.match(/\..+$/)
    ) {
      return NextResponse.next();
    }

    // Marketing site pages → rewrite to /freedombot/* internally
    if (FREEDOMBOT_SITE_PATHS.has(pathname)) {
      const newPath =
        pathname === "/" ? "/freedombot" : `/freedombot${pathname}`;
      return NextResponse.rewrite(new URL(newPath, request.url));
    }

    // Any other path on freedombot.ai (e.g. /live, /purchases) → redirect to homepage
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
