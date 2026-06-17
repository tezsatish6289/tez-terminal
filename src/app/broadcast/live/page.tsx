import { Suspense } from "react";
import { BroadcastScene } from "@/components/broadcast/BroadcastScene";

/**
 * /broadcast/live — the full-screen scene captured by the nightly YouTube live
 * streamer (headless Chrome → FFmpeg → YouTube RTMP). No app chrome, no
 * interactivity: a self-contained 16:9 composition of the option-wall bubble
 * map, an auto-rotating setup slideshow, a live clock, and a CTA ticker that
 * drives free-trial sign-ups. Designed to look correct at 1280×720 and 1920×1080.
 */
export default function BroadcastLivePage() {
  return (
    <Suspense fallback={null}>
      <BroadcastScene />
    </Suspense>
  );
}
