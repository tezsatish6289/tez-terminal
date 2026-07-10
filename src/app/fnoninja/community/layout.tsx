import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Join the Community — F&O Trader Chat | FNO Ninja",
  description:
    "Private subscriber chat for NSE F&O traders — discuss market structure, share charts, and follow community conversations. Sign in with Google.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/community` },
  openGraph: {
    title: "Join the F&O Trader Community",
    description:
      "Real traders. No signals. Chart sharing and live discussions — included with your account.",
    url: `${FNONINJA_SITE_URL}/community`,
  },
};

export default function FnoNinjaCommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
