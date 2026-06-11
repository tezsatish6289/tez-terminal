import type { Metadata } from "next";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";

export const metadata: Metadata = {
  title: "NSE F&O market map — FNONINJA",
  description:
    "Interactive option-chain market map for NSE F&O stocks and indices — derived zones, open interest context, and symbol analytics for independent research.",
  alternates: { canonical: "https://fnoninja.com/levels" },
  openGraph: {
    title: "NSE F&O market map — FNONINJA",
    description:
      "Explore option-derived market structure across the full NSE F&O universe in one interactive bubble map.",
    url: "https://fnoninja.com/levels",
    siteName: "FNONINJA",
    type: "website",
  },
};

export default function FnoNinjaLevelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {children}
      <FnoNinjaFooter />
    </div>
  );
}
