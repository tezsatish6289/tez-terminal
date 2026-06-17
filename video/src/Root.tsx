import React from "react";
import { Composition } from "remotion";
import { ClusterVideo, FPS, totalFrames } from "./ClusterVideo";
import { videoDataSchema, type VideoData } from "./schema";
import { samplePut, sampleCall } from "./data/sample";

const WIDTH = 1080;
const HEIGHT = 1920;

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
    </>
  );
};
