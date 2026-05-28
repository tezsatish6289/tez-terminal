import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Chart — TezTerminal");

export default function ChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
