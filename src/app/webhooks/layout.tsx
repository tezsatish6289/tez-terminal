import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Webhooks — TezTerminal");

export default function WebhooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
