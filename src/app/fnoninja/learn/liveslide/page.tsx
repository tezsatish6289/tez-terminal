import type { Metadata } from "next";
import { FnoNinjaLiveslideLearnRedirect } from "@/components/fnoninja/learn/FnoNinjaLiveslideLearnRedirect";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "What is Liveslide",
  description:
    "Open the in-app Liveslide guide on the market map — intro, purpose, and a guided tour of every control.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/liveslide` },
};

export default function LiveslideLearnPage() {
  return <FnoNinjaLiveslideLearnRedirect />;
}
