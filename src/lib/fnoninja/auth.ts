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

/** Chart deep-dive requires sign-in on FNONINJA only. */
export function isFnoNinjaChartPath(pathname: string): boolean {
  if (pathname === "/levels/chart" || pathname.startsWith("/levels/chart/")) return true;
  return pathname.startsWith("/fnoninja/levels/chart");
}

export function requiresFnoNinjaChartAuth(pathname: string, hostname?: string): boolean {
  return isFnoNinjaAppContext(pathname, hostname) && isFnoNinjaChartPath(pathname);
}

/** Liveslide requires sign-in on FNONINJA only — the bubbles market map stays public. */
export function requiresFnoNinjaLiveslideAuth(pathname: string, hostname?: string): boolean {
  return isFnoNinjaAppContext(pathname, hostname);
}
