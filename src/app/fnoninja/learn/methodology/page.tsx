import type { Metadata } from "next";
import { FnoNinjaMethodologyLearnArticle } from "@/components/fnoninja/learn/FnoNinjaMethodologyLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "How FNONINJA Levels Work — A Beginner's Guide",
  description:
    "In plain English: how FNONINJA turns NSE option-chain open interest into support, resistance, and max pain levels — and what those levels are not.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/methodology` },
};

export default function MethodologyLearnPage() {
  return <FnoNinjaMethodologyLearnArticle />;
}
