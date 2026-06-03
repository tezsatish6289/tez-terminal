import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Chart embed — TezTerminal");

/** Must be dynamic — static prerender ignores ?symbol= query (broken India charts in iframe). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EmbedChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
