import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("FNONINJA live broadcast");

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BroadcastLiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
