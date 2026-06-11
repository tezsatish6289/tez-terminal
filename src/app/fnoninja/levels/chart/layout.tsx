import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Symbol chart",
  description:
    "Option-chain derived zones, open interest context, and price chart for a single NSE F&O symbol — for independent research only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/levels/chart` },
  openGraph: {
    title: "Symbol chart — FNONINJA",
    description:
      "Deep-dive symbol analytics with derived support and resistance zones from NSE option-chain data.",
    url: `${FNONINJA_SITE_URL}/levels/chart`,
  },
};

export default function FnoNinjaLevelsChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
