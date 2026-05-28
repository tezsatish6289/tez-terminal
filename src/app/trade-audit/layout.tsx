import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Trade Audit — TezTerminal");

export default function TradeAuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
