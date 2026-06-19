import { BroadcastThumbnail } from "@/components/broadcast/BroadcastThumbnail";

/**
 * /broadcast/thumbnail — a fixed 1280×720 card the nightly streamer screenshots
 * and sets as the YouTube broadcast thumbnail. Server-rendered so the weekday
 * headline and date are always current. No app chrome, no interactivity.
 */
export const dynamic = "force-dynamic";

export default function BroadcastThumbnailPage() {
  return <BroadcastThumbnail />;
}
