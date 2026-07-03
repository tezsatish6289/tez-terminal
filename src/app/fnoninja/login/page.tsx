import type { Metadata } from "next";
import { FnoNinjaLoginPage } from "@/components/fnoninja/FnoNinjaLoginPage";
import { FNO_LOGIN_PAGE_META_DESCRIPTION } from "@/lib/fnoninja/login-copy";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { NOINDEX_ROBOTS } from "@/lib/seo/constants";

export const metadata: Metadata = {
  title: "Sign in",
  description: FNO_LOGIN_PAGE_META_DESCRIPTION,
  alternates: { canonical: `${FNONINJA_SITE_URL}/login` },
  robots: NOINDEX_ROBOTS,
};

export default function FnoNinjaLoginRoute() {
  return <FnoNinjaLoginPage />;
}
