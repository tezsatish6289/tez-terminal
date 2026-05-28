import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Signals — TezTerminal");

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
