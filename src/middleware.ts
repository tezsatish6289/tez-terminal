import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FREEDOMBOT_HOSTS = ["freedombot.ai", "www.freedombot.ai"];

// Pages that belong to the FreedomBot marketing site (rewritten to /freedombot/*)
const FREEDOMBOT_SITE_PATHS = new Set(["/", "/about", "/privacy", "/terms"]);

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  const isFreedomBotDomain = FREEDOMBOT_HOSTS.some(
    (h) => hostname === h || hostname === `www.${h}`
  );

  if (isFreedomBotDomain) {
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

    // All app pages (/signals, /live, /terminal, /billing, etc.)
    // pass through unchanged — they work on this domain as-is
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
