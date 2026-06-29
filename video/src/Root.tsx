import React from "react";
import { Composition } from "remotion";
import { ClusterVideo, FPS, totalFrames } from "./ClusterVideo";
import { videoDataSchema, type VideoData } from "./schema";
import { samplePut, sampleCall } from "./data/sample";
import { WinStory, winStoryDataSchema, winStoryDuration, WIN_STORY_FPS, type WinStoryData } from "./scenes/WinStory";

const WIDTH = 1080;
const HEIGHT = 1920;

/** Minimal sample so the WinStory composition previews in the studio. */
const sampleWinStory: WinStoryData = {
  symbol: "RELIANCE",
  label: "Reliance",
  scope: "stock",
  side: "support",
  entrySpot: 1420,
  maxPain: 1460,
  invalidation: 1402,
  putClusterStrike: 1400,
  putClusterSize: 4_200_000,
  callClusterStrike: 1500,
  callClusterSize: 3_100_000,
  bullZoneLow: 1410,
  bullZoneHigh: 1430,
  bearZoneLow: null,
  bearZoneHigh: null,
  movePct: 2.8,
  eventAt: "2026-06-20T04:00:00.000Z",
  pocHitAt: "2026-06-24T06:30:00.000Z",
  candles: Array.from({ length: 40 }, (_, i) => {
    const base = 1418 + i * 1.1 + Math.sin(i / 3) * 4;
    const o = base;
    const c = base + (i % 2 === 0 ? 2 : -1.5);
    return { t: 1_718_000_000 + i * 900, o, h: Math.max(o, c) + 3, l: Math.min(o, c) - 3, c };
  }),
};

/**
 * Both daily videos share one composition. At render time, pass real data with
 * `--props=out/put.json` (produced by `npm run fetch`); the defaults are
 * realistic samples so the studio preview works with zero setup.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ClusterPut"
        component={ClusterVideo}
        schema={videoDataSchema}
        defaultProps={samplePut}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={totalFrames(samplePut.stocks.length)}
        calculateMetadata={({ props }) => ({
          durationInFrames: totalFrames((props as VideoData).stocks.length),
        })}
      />
      <Composition
        id="ClusterCall"
        component={ClusterVideo}
        schema={videoDataSchema}
        defaultProps={sampleCall}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={totalFrames(sampleCall.stocks.length)}
        calculateMetadata={({ props }) => ({
          durationInFrames: totalFrames((props as VideoData).stocks.length),
        })}
      />
      <Composition
        id="WinStory"
        component={WinStory}
        schema={winStoryDataSchema}
        defaultProps={sampleWinStory}
        fps={WIN_STORY_FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={winStoryDuration()}
      />
    </>
  );
};
