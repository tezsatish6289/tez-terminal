import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("History — TezTerminal");

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
