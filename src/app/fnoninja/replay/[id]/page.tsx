import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FnoNinjaReplayPage } from "@/components/fnoninja/replay/FnoNinjaReplayPage";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  buildSrReplayTitle,
  listSrReplaySummaries,
} from "@/lib/fnoninja/sr-replays";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw || "").trim();
  if (!id) return { title: "Replay" };

  const replay = await loadStoryReplayPayload(id);
  if (!replay) return { title: "Replay not found" };

  const title = buildSrReplayTitle(replay);
  const description = `${replay.label || replay.symbol}: educational candle replay of a completed ${
    replay.side === "support" ? "put-wall bounce" : "call-wall rejection"
  } (+${replay.movePct.toFixed(1)}% MFE). Not investment advice.`;
  const url = `${FNONINJA_SITE_URL}/replay/${encodeURIComponent(id)}`;
  const ogImage = `${url}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "FNONINJA",
      type: "article",
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

export default async function ReplayRoutePage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw || "").trim();
  if (!id) notFound();

  const replay = await loadStoryReplayPayload(id);
  if (!replay) notFound();

  const title = buildSrReplayTitle(replay);
  const related = (await listSrReplaySummaries({ sort: "best", limit: 8 })).filter(
    (r) => r.id !== id,
  ).slice(0, 3);

  return (
    <FnoNinjaReplayPage id={id} title={title} replay={replay} related={related} />
  );
}
