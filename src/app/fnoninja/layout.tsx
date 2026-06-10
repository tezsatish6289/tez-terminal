import type { Metadata } from "next";
import { FnoNinjaNav } from "@/components/fnoninja/FnoNinjaNav";
import { FNO_PAGE_ROOT } from "@/lib/fnoninja/responsive";

export const metadata: Metadata = {
  metadataBase: new URL("https://fnoninja.com"),
  title: "FNONinja — Option-chain analytics for NSE F&O",
  description:
    "View option-interest concentrations, derived support and resistance observations, and price positioning across NSE F&O stocks and indices. Informational market data visualization only.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://fnoninja.com" },
  openGraph: {
    title: "FNONinja — Option-chain analytics for NSE F&O",
    description:
      "Option-chain derived market structure across NSE F&O — maps, zone views, and symbol analytics for independent research.",
    url: "https://fnoninja.com",
    siteName: "FNONinja",
    type: "website",
    locale: "en_IN",
  },
};

export default function FnoNinjaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={FNO_PAGE_ROOT} style={{ backgroundColor: "#060912", color: "#f1f5f9" }}>
      <FnoNinjaNav />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
