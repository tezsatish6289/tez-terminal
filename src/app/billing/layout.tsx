import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Billing — TezTerminal");

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
