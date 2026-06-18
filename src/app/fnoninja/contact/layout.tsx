import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact FNONINJA for product questions, support, or partnership inquiries about NSE F&O option-chain analytics.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/contact` },
  openGraph: {
    title: "Contact — FNONINJA",
    description: "Get in touch with the FNONINJA team.",
    url: `${FNONINJA_SITE_URL}/contact`,
  },
};

export default function FnoNinjaContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
