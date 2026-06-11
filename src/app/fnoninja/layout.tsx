import type { Metadata } from "next";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";
import { FnoNinjaNav } from "@/components/fnoninja/FnoNinjaNav";
import { FB_PAGE_ROOT, FB_VIEWPORT_MAIN } from "@/lib/freedombot/responsive";
import { FNONINJA_SITE_METADATA, FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { FNO_BG, FNO_TEXT } from "@/lib/fnoninja/theme";

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
    <div className={FB_PAGE_ROOT} style={{ backgroundColor: FNO_BG, color: FNO_TEXT }}>
      <FnoNinjaNav />
      <div className={`${FB_VIEWPORT_MAIN} flex flex-col flex-1 min-h-0 min-w-0`}>{children}</div>
      <FnoNinjaFooter />
    </div>
  );
}
