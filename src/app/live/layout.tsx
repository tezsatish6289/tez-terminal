import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Live — TezTerminal");

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
