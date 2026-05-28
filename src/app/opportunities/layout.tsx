import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Opportunities — TezTerminal");

export default function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
