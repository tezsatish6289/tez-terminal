import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Levels bubbles embed — FNONINJA");

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EmbedLevelsBubblesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
