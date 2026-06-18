import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Free F&O Webinar",
  description:
    "Join FNONINJA's free 1-hour live webinar, every evening at 8 PM IST — learn to read option-chain support & resistance, max-pain, and open-interest walls. Educational only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/webinar` },
  openGraph: {
    title: "Free F&O Webinar — FNONINJA",
    description:
      "A free, beginner-friendly live session on reading option-chain market structure. Daily at 8 PM IST.",
    url: `${FNONINJA_SITE_URL}/webinar`,
  },
};

export default function FnoNinjaWebinarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
