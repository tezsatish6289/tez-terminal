import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Free Live Webinar — Read Option Chains Like an Analyst | FNO Ninja",
  description:
    "Join a free 60-minute live session on reading option-chain support, resistance and max-pain zones — and building a rule-based plan around them.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/webinar` },
  openGraph: {
    title: "Free Live Webinar — Read Option Chains Like an Analyst",
    description:
      "60 minutes. Clear frameworks. Live Q&A. Learn how pros read positioning data.",
    url: `${FNONINJA_SITE_URL}/webinar`,
  },
};

export default function FnoNinjaWebinarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
