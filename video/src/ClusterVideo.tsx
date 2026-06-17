import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoData } from "./schema";
import { pickMusicTrack } from "./audio";
import { Background } from "./components/Background";
import { Watermark } from "./components/Watermark";
import { FooterDisclaimer } from "./components/FooterDisclaimer";
import { Intro } from "./scenes/Intro";
import { StockSegment } from "./scenes/StockSegment";
import { MidCta } from "./scenes/MidCta";
import { Recap } from "./scenes/Recap";
import { EndCta } from "./scenes/EndCta";

export const FPS = 30;
export const DUR = {
  intro: 75,
  stock: 210,
  midCta: 60,
  recap: 90,
  endCta: 150,
} as const;

/** Insert the mid-roll CTA after this many stocks (0-based: after stock #3). */
const MID_AFTER = 3;

/** Looping background bed with a gentle fade-in and fade-out. */
const BgMusic: React.FC<{ track: string }> = ({ track }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fadeIn = fps; // 1s
  const fadeOut = Math.round(fps * 1.5);
  const vol = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 0.55, 0.55, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <Audio src={staticFile(track)} loop volume={Math.max(0, vol)} />;
};

/** Total composition length for the given stock count. */
export function totalFrames(count: number): number {
  const midCount = count > MID_AFTER ? 1 : 0;
  return DUR.intro + count * DUR.stock + midCount * DUR.midCta + DUR.recap + DUR.endCta;
}

export const ClusterVideo: React.FC<VideoData> = ({ variant, dateLabel, generatedAtLabel, stocks, musicTrack }) => {
  const count = stocks.length;
  const track = musicTrack ?? pickMusicTrack(dateLabel, variant);
  let cursor = 0;
  const blocks: React.ReactNode[] = [];

  const push = (node: React.ReactNode, len: number, key: string) => {
    blocks.push(
      <Sequence key={key} from={cursor} durationInFrames={len}>
        {node}
      </Sequence>,
    );
    cursor += len;
  };

  push(<Intro variant={variant} dateLabel={dateLabel} count={count} />, DUR.intro, "intro");

  stocks.forEach((slide, i) => {
    push(
      <StockSegment slide={slide} rank={i + 1} total={count} variant={variant} />,
      DUR.stock,
      `stock-${slide.symbol}-${i}`,
    );
    if (i + 1 === MID_AFTER && count > MID_AFTER) {
      push(<MidCta />, DUR.midCta, "mid-cta");
    }
  });

  push(<Recap stocks={stocks} variant={variant} />, DUR.recap, "recap");
  push(<EndCta generatedAtLabel={generatedAtLabel} />, DUR.endCta, "end-cta");

  // End CTA owns its own disclaimer/branding; keep the persistent chrome off it.
  const chromeUntil = cursor - DUR.endCta;

  return (
    <Background>
      <BgMusic track={track} />
      {blocks}
      <Sequence from={0} durationInFrames={chromeUntil}>
        <AbsoluteFill>
          <Watermark />
          <FooterDisclaimer generatedAtLabel={generatedAtLabel} />
        </AbsoluteFill>
      </Sequence>
    </Background>
  );
};
