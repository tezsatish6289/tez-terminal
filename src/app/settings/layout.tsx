import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Settings — TezTerminal");

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
