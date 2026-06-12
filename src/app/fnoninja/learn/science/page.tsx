import type { Metadata } from "next";
import { ScienceLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Understanding Put & Call Clusters and Max Pain",
  description:
    "Simple explanations of option chain zones, why price reacts around them, and how to read them on NIFTY charts.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/science` },
};

export default function ScienceLearnPage() {
  return <ScienceLearnArticle />;
}
