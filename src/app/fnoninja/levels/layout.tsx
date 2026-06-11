import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "NSE F&O market map",
  description:
    "Interactive option-chain market map for NSE F&O stocks and indices — derived zones, open interest context, and symbol analytics for independent research.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/levels` },
  openGraph: {
    title: "NSE F&O market map — FNONINJA",
    description:
      "Explore option-derived market structure across the full NSE F&O universe in one interactive bubble map.",
    url: `${FNONINJA_SITE_URL}/levels`,
  },
};

export default function FnoNinjaLevelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
