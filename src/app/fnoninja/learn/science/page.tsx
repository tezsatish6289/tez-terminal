import type { Metadata } from "next";
import { ScienceLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "The science behind the zones",
  description:
    "Learn what put clusters, call clusters, max pain, and expiry mean on FNONINJA — with a sample NIFTY chart. Informational only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/science` },
};

export default function ScienceLearnPage() {
  return <ScienceLearnArticle />;
}
