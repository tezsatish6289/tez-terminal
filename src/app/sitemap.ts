import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { FREEDOMBOT_PUBLIC_PATHS, isFreedomBotHost } from "@/lib/seo/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "";

  if (!isFreedomBotHost(host)) {
    return [];
  }

  const baseUrl = "https://freedombot.ai";
  const now = new Date();

  return FREEDOMBOT_PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? baseUrl : `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency:
      path === "/records" || path === "/performance" ? ("daily" as const) : ("weekly" as const),
    priority: path === "/" ? 1 : path === "/records" || path === "/performance" ? 0.9 : 0.7,
  }));
}
