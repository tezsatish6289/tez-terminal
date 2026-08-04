import type { Metadata } from "next";
import { FnoNinjaTodayBoard } from "@/components/fnoninja/today/FnoNinjaTodayBoard";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { listSrReplaySummaries } from "@/lib/fnoninja/sr-replays";
import {
  loadTodayBoard,
  todayBoardMetaDescription,
  todayBoardMetaTitle,
} from "@/lib/fnoninja/today-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const board = await loadTodayBoard();
  const title = todayBoardMetaTitle(board);
  const description = todayBoardMetaDescription(board);
  const ogImage = `${FNONINJA_SITE_URL}/today/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: `${FNONINJA_SITE_URL}/today` },
    openGraph: {
      title,
      description,
      url: `${FNONINJA_SITE_URL}/today`,
      siteName: "FNONINJA",
      type: "website",
      locale: "en_IN",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function FnoNinjaTodayPage() {
  const [board, replays] = await Promise.all([
    loadTodayBoard(),
    listSrReplaySummaries({ sort: "latest", limit: 8 }),
  ]);

  return <FnoNinjaTodayBoard board={board} replays={replays} />;
}
