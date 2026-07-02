"use client";

import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FNO_BG_CANVAS, FNO_CARD_BG, FNO_MUTED } from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

/** Unified first-fold card — copy left, live bubble map right. */
export function FnoNinjaHeroCard() {
  return (
    <div
      className="relative rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col lg:flex-row flex-1 min-h-0 h-full shadow-2xl"
      style={{
        border: "1px solid rgba(90,140,220,0.2)",
        backgroundColor: FNO_CARD_BG,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(90,140,220,0.06)",
      }}
    >
      <div
        className="absolute top-4 left-4 sm:top-5 sm:left-5 lg:top-6 lg:left-6 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
        style={{
          backgroundColor: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.28)",
        }}
      >
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ backgroundColor: "#22c55e" }}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
        </span>
        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider" style={{ color: "#4ade80" }}>
          Live
        </span>
      </div>

      {/* Left — headline, subtext, CTA */}
      <div className="flex flex-col justify-center gap-8 sm:gap-10 lg:gap-12 p-6 sm:p-8 lg:p-10 xl:p-12 pt-14 sm:pt-16 lg:pt-10 lg:w-[40%] xl:w-[38%] lg:shrink-0 lg:border-r border-white/[0.06]">
        <div className="space-y-6 sm:space-y-8 lg:space-y-10">
          <h1 className="text-[1.95rem] sm:text-[2.35rem] lg:text-[2.5rem] xl:text-[2.85rem] font-black tracking-tight leading-[1.12] text-white">
            Visualize price pressure before the move happens
          </h1>

          <p className="text-sm sm:text-base lg:text-lg leading-relaxed max-w-xl" style={{ color: FNO_MUTED }}>
            Real-time support and resistance mapping for Indian F&amp;O stocks based on live option-chain
            Open Interest clusters.
          </p>
        </div>

        <div className="space-y-3 sm:space-y-4 mt-auto lg:mt-0">
          <FnoNinjaCtaLink className="w-full">Explore live market map</FnoNinjaCtaLink>
          <p className="text-[10px] sm:text-[11px]" style={{ color: "#334155" }}>
            Informational only · Not investment advice
          </p>
        </div>
      </div>

      {/* Right — live bubble map only (no decorative chrome) */}
      <div className="relative flex-1 min-h-[min(46vh,380px)] lg:min-h-0 min-w-0" style={{ backgroundColor: FNO_BG_CANVAS }}>
        <iframe
          src={EMBED_SRC}
          title="NSE F&O market bubble map"
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          scrolling="no"
          referrerPolicy="same-origin"
        />
      </div>
    </div>
  );
}
