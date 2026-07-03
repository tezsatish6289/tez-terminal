import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** fnoninja.com + local dev — public marketing + levels UI only. */
const FNONINJA_HOSTS = [
  "fnoninja.com",
  "www.fnoninja.com",
  "localhost",
  "127.0.0.1",
];

function hostCandidates(request: NextRequest): string[] {
  const forwarded = request.headers.get("x-forwarded-host") || "";
  const host = request.headers.get("host") || "";
  return [forwarded, host]
    .map((h) => h.split(":")[0].trim().toLowerCase())
    .filter(Boolean);
}

function isFnoNinjaHost(request: NextRequest): boolean {
  return hostCandidates(request).some((h) => FNONINJA_HOSTS.includes(h));
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!isFnoNinjaHost(request)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/favicon.ico") {
    return NextResponse.rewrite(new URL("/fnoninja/icon.svg", request.url));
  }

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

  if (pathname === "/opengraph-image" || pathname === "/twitter-image") {
    return NextResponse.rewrite(new URL(`/fnoninja${pathname}`, request.url));
  }

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
    pathname === "/levels" ||
    pathname.startsWith("/levels/")
  ) {
    return NextResponse.rewrite(new URL(`/fnoninja${pathname}`, request.url));
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

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
