import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAdminFirestore } from "@/firebase/admin";
import type { VideoTopic } from "./topics";

/**
 * Compact, caption-ready projection of the data that actually went into the
 * video. We read the exact props JSON the Remotion pipeline rendered from
 * (`video/out/{put,call}.json`, produced by `npm run fetch`) so the captions
 * describe precisely what a viewer sees — same stocks, same date, same numbers.
 */

export interface TopicStockSummary {
  symbol: string;
  label: string;
  spot: number | null;
  zoneState: "IN" | "NEAR" | null;
  clusterSize: number | null;
  clusterStrike: number | null;
  maxPain: number | null;
  atmIV: number | null;
  contextTag: string | null;
}

export interface TopicSummary {
  topicId: string;
  variant: "put" | "call";
  dateLabel: string;
  generatedAtLabel: string | null;
  stockCount: number;
  stocks: TopicStockSummary[];
}

/** Repo-root-relative location of the rendered props for a topic. */
function propsPath(topic: VideoTopic): string {
  return path.join(process.cwd(), "video", topic.propsFile);
}

interface RawSlide {
  symbol?: string;
  label?: string;
  spot?: number | null;
  zoneState?: "IN" | "NEAR";
  putClusterSize?: number | null;
  putClusterStrike?: number | null;
  callClusterSize?: number | null;
  callClusterStrike?: number | null;
  maxPain?: number | null;
  atmIV?: number | null;
  contextTag?: string | null;
}

interface RawProps {
  variant?: "put" | "call";
  dateLabel?: string;
  generatedAtLabel?: string;
  stocks?: RawSlide[];
}

export class TopicDataMissingError extends Error {
  topic: VideoTopic;
  constructor(topic: VideoTopic) {
    super(`No data found for "${topic.label}" — run the fetch step first.`);
    this.name = "TopicDataMissingError";
    this.topic = topic;
  }
}

/**
 * Cloud-render fallback: the Cloud Run Job publishes a compact summary to
 * `video_props/{topicId}` (see video/scripts/cloud-render.mjs) because prod has
 * no access to the container's local props file. Returns null if absent.
 */
async function readPropsFromFirestore(topic: VideoTopic): Promise<RawProps | null> {
  try {
    const snap = await getAdminFirestore().collection("video_props").doc(topic.id).get();
    return snap.exists ? (snap.data() as RawProps) : null;
  } catch {
    return null;
  }
}

export async function buildTopicSummary(topic: VideoTopic): Promise<TopicSummary> {
  let raw: RawProps | null = null;
  try {
    const text = await readFile(propsPath(topic), "utf8");
    raw = JSON.parse(text) as RawProps;
  } catch {
    // Not on the local render machine — fall back to the cloud-published summary.
    raw = await readPropsFromFirestore(topic);
  }
  if (!raw) throw new TopicDataMissingError(topic);

  const variant = raw.variant ?? topic.variant;
  const slides = Array.isArray(raw.stocks) ? raw.stocks : [];

  const stocks: TopicStockSummary[] = slides.map((s) => ({
    symbol: s.symbol ?? "",
    label: s.label ?? s.symbol ?? "",
    spot: s.spot ?? null,
    zoneState: s.zoneState ?? null,
    clusterSize: (variant === "put" ? s.putClusterSize : s.callClusterSize) ?? null,
    clusterStrike: (variant === "put" ? s.putClusterStrike : s.callClusterStrike) ?? null,
    maxPain: s.maxPain ?? null,
    atmIV: s.atmIV ?? null,
    contextTag: s.contextTag ?? null,
  }));

  return {
    topicId: topic.id,
    variant,
    dateLabel: raw.dateLabel ?? "",
    generatedAtLabel: raw.generatedAtLabel ?? null,
    stockCount: stocks.length,
    stocks,
  };
}
