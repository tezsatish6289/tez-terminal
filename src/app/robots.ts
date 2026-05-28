import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isFreedomBotHost, TEZTERMINAL_BLOCK_ROBOTS } from "@/lib/seo/constants";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";

  if (isFreedomBotHost(host)) {
    return {
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://freedombot.ai/sitemap.xml",
      host: "https://freedombot.ai",
    };
  }

  // TezTerminal is not a public consumer product — do not crawl or index.
  return {
    rules: TEZTERMINAL_BLOCK_ROBOTS,
  };
}
