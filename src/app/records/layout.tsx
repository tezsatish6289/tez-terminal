import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Records — TezTerminal");

export default function TezRecordsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
