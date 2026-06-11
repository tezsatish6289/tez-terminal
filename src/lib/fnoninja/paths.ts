export function fnoHomeHref(pathname: string): string {
  if (pathname.startsWith("/fnoninja")) return "/fnoninja";
  return "/";
}

/** Hash link to a marketing section — works from /levels and other subpages. */
export function fnoMarketingHash(pathname: string, hash: string): string {
  const home = fnoHomeHref(pathname);
  if (pathname === home) return hash;
  if (home === "/fnoninja") return `/fnoninja${hash}`;
  return `${home}${hash}`;
}

/** Levels app — fnoninja.com uses /levels; local dev uses /fnoninja/levels or /freedombot/levels. */
export function fnoAnalyticsHref(pathname: string): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/levels";
  }
  if (pathname.startsWith("/fnoninja")) return "/fnoninja/levels";
  if (pathname.startsWith("/freedombot")) return "/freedombot/levels";
  return "/levels";
}

/** Public /levels URL for the current host (embed + CTAs on fnoninja.com). */
export function fnoLevelsHrefForHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h === "fnoninja.com" || h === "www.fnoninja.com") return "/levels";
  return "/fnoninja/levels";
}
