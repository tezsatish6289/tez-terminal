import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Chart embed — TezTerminal");

export default function EmbedChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
