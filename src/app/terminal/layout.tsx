import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Terminal — TezTerminal");

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
