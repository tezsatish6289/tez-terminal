import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Purchases — TezTerminal");

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
