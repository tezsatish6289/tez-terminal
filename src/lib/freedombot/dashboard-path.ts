/** Public marketing paths: /records on freedombot.ai, /freedombot/records locally. */
export function freedombotSitePath(pathname: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!pathname.startsWith("/freedombot")) return normalized;
  if (normalized === "/") return "/freedombot";
  return `/freedombot${normalized}`;
}

/** Resolve dashboard URLs for local (/freedombot/*) vs production (/… rewrite). */
export function freedombotDashboardBase(pathname: string): string {
  return pathname.startsWith("/freedombot") ? "/freedombot/dashboard" : "/dashboard";
}

export function freedombotBotDetailPath(pathname: string, deploymentId: string): string {
  return `${freedombotDashboardBase(pathname)}/${deploymentId}`;
}

export function freedombotHomePath(pathname: string): string {
  return pathname.startsWith("/freedombot") ? "/freedombot" : "/";
}

export function isFreedomBotDashboardPath(pathname: string): boolean {
  return (
    pathname === "/freedombot/dashboard" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/freedombot/dashboard/") ||
    pathname.startsWith("/dashboard/")
  );
}
