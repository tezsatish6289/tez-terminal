"use client";

import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FNO_ACCENT, FNO_BG_CANVAS, FNO_CARD_BG, FNO_MUTED } from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

/** Unified first-fold card — copy left, live bubble map right. */
export function FnoNinjaHeroCard() {
  return (
    <div
      className="rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col lg:flex-row flex-1 min-h-0 h-full shadow-2xl"
      style={{
        border: "1px solid rgba(90,140,220,0.2)",
        backgroundColor: FNO_CARD_BG,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(90,140,220,0.06)",
      }}
    >
      {/* Left — headline, subtext, CTA */}
      <div className="flex flex-col justify-center gap-5 sm:gap-6 p-5 sm:p-7 lg:p-8 xl:p-10 lg:w-[40%] xl:w-[38%] lg:shrink-0 lg:border-r border-white/[0.06]">
        <div className="space-y-4 sm:space-y-6">
          <h1 className="text-[1.95rem] sm:text-[2.35rem] lg:text-[2.5rem] xl:text-[2.85rem] font-black tracking-tight leading-[1.08] text-white">
            <span className="block">See where</span>
            <span
              className="block text-[2.35rem] sm:text-[2.65rem] lg:text-[2.9rem] xl:text-[3.25rem] leading-[1.05]"
              style={{ color: FNO_ACCENT }}
            >
              Smart Money
            </span>
            <span className="block">is positioned.</span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl leading-relaxed" style={{ color: FNO_MUTED }}>
            We turn thousands of option-chain data points into clear support, resistance, and market
            structure across the entire NSE F&amp;O universe in real time.
          </p>
        </div>

        <div className="space-y-2.5 mt-auto lg:mt-0">
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
