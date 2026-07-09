/** True when the app is served under the FNONINJA product (prod host or dev rewrite). */
export function isFnoNinjaAppContext(pathname: string, hostname?: string): boolean {
  const h = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  if (h === "fnoninja.com" || h === "www.fnoninja.com") return true;
  return pathname.startsWith("/fnoninja");
}

/** Levels routes that use the analytics nav (auth CTA instead of marketing CTA). */
export function isFnoNinjaLevelsPath(pathname: string): boolean {
  if (pathname === "/levels" || pathname.startsWith("/levels/")) return true;
  if (pathname.startsWith("/fnoninja/levels")) return true;
  return false;
}

/** Symbol chart deep-dive (/levels/chart). */
export function isFnoNinjaChartPath(pathname: string): boolean {
  if (pathname === "/levels/chart" || pathname.startsWith("/levels/chart/")) return true;
  return pathname.startsWith("/fnoninja/levels/chart");
}

/** Chart deep-dive is public on FNONINJA (symbol links can be shared without sign-in). */
export function requiresFnoNinjaChartAuth(_pathname: string, _hostname?: string): boolean {
  return false;
}

/** Main market map (/levels) requires sign-in on FNONINJA — not the chart deep-dive. */
export function requiresFnoNinjaBubbleMapAuth(pathname: string, hostname?: string): boolean {
  if (!isFnoNinjaAppContext(pathname, hostname)) return false;
  if (isFnoNinjaChartPath(pathname)) return false;
  return isFnoNinjaLevelsPath(pathname);
}

/** Liveslide / favslide require sign-in on FNONINJA (same host as the market map). */
export function requiresFnoNinjaLiveslideAuth(pathname: string, hostname?: string): boolean {
  return isFnoNinjaAppContext(pathname, hostname);
}

function isLocalDevHost(hostname?: string): boolean {
  const h = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

/** Local dev only — preview Liveslide/Favslide UI without Google sign-in. */
export function bypassFnoNinjaSlideAuthForLocalDev(hostname?: string): boolean {
  return process.env.NODE_ENV === "development" && isLocalDevHost(hostname);
}
