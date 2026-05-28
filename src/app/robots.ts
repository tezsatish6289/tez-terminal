import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  isFreedomBotFromHeaders,
  TEZTERMINAL_BLOCK_ROBOTS,
} from "@/lib/seo/constants";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerStore = await headers();

  if (isFreedomBotFromHeaders(headerStore)) {
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/dashboard/"] },
      sitemap: "https://freedombot.ai/sitemap.xml",
      host: "https://freedombot.ai",
    };
  }

  return {
    rules: TEZTERMINAL_BLOCK_ROBOTS,
  };
}
