import type { Metadata } from "next";
import { FnoNinjaLoginPage } from "@/components/fnoninja/FnoNinjaLoginPage";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { NOINDEX_ROBOTS } from "@/lib/seo/constants";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to FNONINJA with Google — 1 month free access to NSE F&O analytics.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/login` },
  robots: NOINDEX_ROBOTS,
};

export default function FnoNinjaLoginRoute() {
  return <FnoNinjaLoginPage />;
}
