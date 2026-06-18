import type { Metadata } from "next";
import { FnoNinjaClientProviders } from "@/components/fnoninja/FnoNinjaClientProviders";
import { FnoNinjaPageShell } from "@/components/fnoninja/FnoNinjaPageShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { FNONINJA_SITE_METADATA, FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  FNONINJA_ORGANIZATION_JSON_LD,
  FNONINJA_WEBSITE_JSON_LD,
} from "@/lib/fnoninja/seo";

export const metadata: Metadata = {
  ...FNONINJA_SITE_METADATA,
  alternates: { canonical: FNONINJA_SITE_URL },
  openGraph: {
    ...FNONINJA_SITE_METADATA.openGraph,
    title: "FNONINJA — Option-chain analytics for NSE F&O",
    description:
      "Option-chain derived market structure across NSE F&O — maps, zone views, and symbol analytics for independent research.",
    url: FNONINJA_SITE_URL,
  },
  twitter: {
    ...FNONINJA_SITE_METADATA.twitter,
    title: "FNONINJA — Option-chain analytics for NSE F&O",
    description:
      "Option-chain derived market structure across NSE F&O — maps, zone views, and symbol analytics.",
  },
};

export default function FnoNinjaLayout({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaClientProviders>
      <JsonLd data={[FNONINJA_ORGANIZATION_JSON_LD, FNONINJA_WEBSITE_JSON_LD]} />
      <FnoNinjaPageShell>{children}</FnoNinjaPageShell>
    </FnoNinjaClientProviders>
  );
}
