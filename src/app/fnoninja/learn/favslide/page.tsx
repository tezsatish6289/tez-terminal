import type { Metadata } from "next";
import { FavslideLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "What is Favslide",
  description:
    "Build a personal watchlist and use Favslide to monitor symbols and running trades on FNONINJA. Informational only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/favslide` },
};

export default function FavslideLearnPage() {
  return <FavslideLearnArticle />;
}
