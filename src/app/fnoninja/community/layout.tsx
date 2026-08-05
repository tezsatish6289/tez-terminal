import type { Metadata } from "next";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

export const metadata: Metadata = {
  title: "Join the Community — F&O Trader Chat | FNO Ninja",
  description: `Private F&O trader chat — discuss market structure and share charts. Included with your ${FNONINJA_FREE_TRIAL_DAYS}-day free trial. Sign in with Google.`,
  alternates: { canonical: `${FNONINJA_SITE_URL}/community` },
  openGraph: {
    title: "Join the F&O Trader Community",
    description: `Real traders. No signals. Chart sharing and live discussions — included with your ${FNONINJA_FREE_TRIAL_DAYS}-day free trial.`,
    url: `${FNONINJA_SITE_URL}/community`,
  },
};

export default function FnoNinjaCommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
