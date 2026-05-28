import type { Metadata, MetadataRoute } from "next";

/** App / authenticated surfaces — exclude from search indexes. */
export const NOINDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export const FREEDOMBOT_PUBLIC_PATHS = [
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/records",
  "/performance",
  "/methodology",
] as const;

/** TezTerminal is internal; consumer-facing discovery is FreedomBot.ai only. */
export const TEZTERMINAL_BLOCK_ROBOTS: MetadataRoute.Robots["rules"] = [
  { userAgent: "*", disallow: "/" },
  { userAgent: "GPTBot", disallow: "/" },
  { userAgent: "ChatGPT-User", disallow: "/" },
  { userAgent: "Google-Extended", disallow: "/" },
  { userAgent: "anthropic-ai", disallow: "/" },
  { userAgent: "ClaudeBot", disallow: "/" },
  { userAgent: "Bytespider", disallow: "/" },
  { userAgent: "CCBot", disallow: "/" },
  { userAgent: "cohere-ai", disallow: "/" },
];

export function isFreedomBotHost(host: string): boolean {
  const h = host.split(":")[0].trim().toLowerCase();
  return h === "freedombot.ai" || h === "www.freedombot.ai";
}

/** Firebase App Hosting often sets the public hostname on x-forwarded-host, not host. */
export function isFreedomBotFromHeaders(headerStore: Headers): boolean {
  const candidates = [headerStore.get("x-forwarded-host"), headerStore.get("host")].filter(
    (v): v is string => Boolean(v),
  );
  return candidates.some((raw) => isFreedomBotHost(raw));
}

export const FREEDOMBOT_ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "FreedomBot.ai",
  url: "https://freedombot.ai",
  logo: "https://freedombot.ai/freedombot/icon.png",
  description:
    "Algorithmic crypto trading with every trade recorded on-chain. Deploy on Bybit in minutes with full transparency and control.",
  sameAs: [] as string[],
};

export const FREEDOMBOT_WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "FreedomBot.ai",
  url: "https://freedombot.ai",
  description:
    "Trade with full transparency and control. On-chain trade records, rule-based bots, and user-owned exchange API keys.",
  publisher: { "@type": "Organization", name: "FreedomBot.ai" },
};
