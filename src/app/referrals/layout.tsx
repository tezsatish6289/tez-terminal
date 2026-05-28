import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Referrals — TezTerminal");

export default function ReferralsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
