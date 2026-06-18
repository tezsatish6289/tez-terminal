import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const FNONINJA_ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "FNONINJA",
  alternateName: ["FNO Ninja", "F&O Ninja"],
  url: FNONINJA_SITE_URL,
  logo: `${FNONINJA_SITE_URL}/fnoninja/icon.svg`,
  description:
    "Option-chain analytics and market data visualization for NSE F&O — derived observations for independent research. Not investment advice.",
  sameAs: [
    "https://www.instagram.com/fnoninja/",
    "https://www.youtube.com/@fnoninja",
    "https://www.linkedin.com/company/fno-ninja/",
  ],
};

export const FNONINJA_WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "FNONINJA",
  alternateName: ["FNO Ninja", "F&O Ninja"],
  url: FNONINJA_SITE_URL,
  description:
    "Interactive option-chain market maps, open-interest clusters, and derived zone analytics across NSE F&O stocks and indices.",
  publisher: { "@type": "Organization", name: "FNONINJA" },
  inLanguage: "en-IN",
};
