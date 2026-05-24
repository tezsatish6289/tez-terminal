/** Resolve dashboard URLs for local (/freedombot/*) vs production (/… rewrite). */
export function freedombotDashboardBase(pathname: string): string {
  return pathname.startsWith("/freedombot") ? "/freedombot/dashboard" : "/dashboard";
}

export function freedombotBotDetailPath(pathname: string, deploymentId: string): string {
  return `${freedombotDashboardBase(pathname)}/${deploymentId}`;
}

export function isFreedomBotDashboardPath(pathname: string): boolean {
  return (
    pathname === "/freedombot/dashboard" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/freedombot/dashboard/") ||
    pathname.startsWith("/dashboard/")
  );
}
