export function fnoHomeHref(pathname: string): string {
  if (pathname.startsWith("/fnoninja")) return "/fnoninja";
  return "/";
}

/** Levels app — localhost dev uses /freedombot/levels; fnoninja.com uses /levels. */
export function fnoAnalyticsHref(pathname: string): string {
  if (pathname.startsWith("/fnoninja") || pathname.startsWith("/freedombot")) {
    return "/freedombot/levels";
  }
  return "/levels";
}
