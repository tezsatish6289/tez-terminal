import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Admin — TezTerminal");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
