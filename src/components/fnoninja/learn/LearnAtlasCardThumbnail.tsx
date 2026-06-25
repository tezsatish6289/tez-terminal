"use client";

import { AtlasLearnMenuMock } from "@/components/fnoninja/learn/AtlasLearnMenuMock";

/** Atlas request-menu preview for the Learn hub card — matches the in-app coach panel. */
export function LearnAtlasCardThumbnail({ accent }: { accent: string }) {
  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden flex items-center justify-center"
      style={{ background: accent }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.18), transparent 70%), rgba(8,15,30,0.94)",
        }}
      />
      <div className="relative z-[1] w-[88%] max-w-[300px]">
        <AtlasLearnMenuMock symbolLabel="Nifty 50" thumbnail />
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{ background: "linear-gradient(to top, rgba(8,15,30,0.75) 0%, transparent 35%)" }}
      />
    </div>
  );
}
