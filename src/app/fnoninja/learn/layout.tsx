import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Plain-language guides to option-chain zones on FNONINJA — informational market data education for independent research.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn` },
  openGraph: {
    title: "Learn — FNONINJA",
    description:
      "Understand put/call clusters, max pain, and zone structure before you use the market map.",
    url: `${FNONINJA_SITE_URL}/learn`,
  },
};

export default function FnoNinjaLearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
