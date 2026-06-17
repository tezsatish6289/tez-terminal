/**
 * Registry of automated FNONINJA short-video topics + the social platforms we
 * publish them to. This is the single source of truth for the /admin/videos
 * module — add a new topic here as the Remotion pipeline grows and the whole
 * admin UI (topic picker, render command, caption generation) picks it up.
 *
 * The actual MP4s are rendered by the standalone Remotion package in `video/`
 * (see video/README.md). Each topic maps 1:1 to a Remotion composition.
 */

export type VideoVariant = "put" | "call";
export type VideoPlatformId = "twitter" | "facebook" | "linkedin" | "youtube" | "instagram";

export interface VideoTopic {
  /** Stable id used in URLs / API calls. */
  id: string;
  /** Human label for the topic picker. */
  label: string;
  /** Short one-liner describing what the video covers. */
  description: string;
  /** Which daily variant this maps to in the video pipeline. */
  variant: VideoVariant;
  /** Remotion composition id (see video/src/Root.tsx). */
  compositionId: string;
  /** Props JSON the fetch step writes, relative to the `video/` dir. */
  propsFile: string;
  /** Rendered MP4 output, relative to the `video/` dir. */
  outputFile: string;
}

/**
 * Currently automated topics. Today the pipeline ships two daily variants
 * (put-wall support / call-wall resistance); append new topics here as we
 * build their Remotion compositions.
 */
export const VIDEO_TOPICS: VideoTopic[] = [
  {
    id: "put-wall",
    label: "Put Walls — Support",
    description:
      "Top F&O stocks sitting on a massive put-cluster support wall (bullish lean).",
    variant: "put",
    compositionId: "ClusterPut",
    propsFile: "out/put.json",
    outputFile: "out/put-cluster.mp4",
  },
  {
    id: "call-wall",
    label: "Call Walls — Resistance",
    description:
      "Top F&O stocks pressing into a massive call-cluster resistance wall (bearish lean).",
    variant: "call",
    compositionId: "ClusterCall",
    propsFile: "out/call.json",
    outputFile: "out/call-cluster.mp4",
  },
];

export function getTopic(id: string): VideoTopic | undefined {
  return VIDEO_TOPICS.find((t) => t.id === id);
}

export interface VideoPlatform {
  id: VideoPlatformId;
  label: string;
  /** Lucide icon name used on the admin page. */
  icon: string;
  /** Soft per-platform character budget the captions aim to respect. */
  charLimit: number;
  /** Whether hashtags read naturally on this platform. */
  hashtags: boolean;
  /** Guidance fed to the caption generator so each platform sounds native. */
  guidance: string;
}

/** The one common video is posted to every platform; only the text differs. */
export const VIDEO_PLATFORMS: VideoPlatform[] = [
  {
    id: "twitter",
    label: "Twitter / X",
    icon: "Twitter",
    charLimit: 280,
    hashtags: false,
    guidance:
      "Punchy, trader-to-trader. Hard cap 280 chars. Lead with the most striking number. Short lines. No hashtags, no emojis.",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: "Facebook",
    charLimit: 500,
    hashtags: false,
    guidance:
      "Slightly more conversational than X, up to ~3 short paragraphs. A plain-language hook that a non-pro can follow. No more than 1-2 hashtags if any.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "Linkedin",
    charLimit: 1300,
    hashtags: true,
    guidance:
      "Professional, insightful, markets-educational tone. Open with a one-line hook, then 2-4 tight lines of context. End with 3-5 relevant hashtags on their own line.",
  },
  {
    id: "youtube",
    label: "YouTube (Shorts)",
    icon: "Youtube",
    charLimit: 700,
    hashtags: true,
    guidance:
      "First line is a click-worthy title (<=70 chars). Then a short description. End with 3-5 hashtags including #shorts. Mention fnoninja.com.",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "Instagram",
    charLimit: 2200,
    hashtags: true,
    guidance:
      "Engaging hook line, a few scannable lines (line breaks ok), light use of relevant emojis allowed. End with 8-12 niche hashtags (options, nifty, fno, trading) on their own line.",
  },
];
