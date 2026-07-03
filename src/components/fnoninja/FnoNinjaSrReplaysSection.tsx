"use client";

import { useEffect, useState } from "react";
import { FnoNinjaSrReplaysShowcase } from "@/components/fnoninja/FnoNinjaSrReplaysShowcase";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import type { SrReplayWithStory } from "@/lib/fnoninja/sr-replay-types";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

export function FnoNinjaSrReplaysSection() {
  const [replays, setReplays] = useState<SrReplayWithStory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fnoninja/sr-replays?sort=best&limit=12&withStory=1", {
          cache: "no-store",
        });
        const json = (await res.json()) as { replays?: SrReplayWithStory[] };
        if (!cancelled && res.ok && Array.isArray(json.replays)) {
          setReplays(json.replays);
        } else if (!cancelled) {
          setReplays([]);
        }
      } catch {
        if (!cancelled) setReplays([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (replays === null || replays.length === 0) return null;

  return (
    <section id="real-examples" className="relative overflow-hidden border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] opacity-70"
        style={{
          background: "radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.14), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className={`${FNO_LANDING_SHELL} relative py-14 sm:py-20 lg:py-24`}>
        <div className="mb-10 sm:mb-12 max-w-3xl">
          <SectionEyebrow>Real examples</SectionEyebrow>
          <h2 className="mt-4 text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
            Put/Call Clusters often act as <GradientText>Support &amp; Resistance</GradientText> zones
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base leading-relaxed max-w-2xl text-slate-400">
            Not predictions — observations. Price tends to react around them. Every card below is a
            real, resolved move from a past session.
          </p>
        </div>

        <FnoNinjaSrReplaysShowcase initialReplays={replays} initialSort="best" />

        <div className="mt-14 overflow-hidden border-y py-4" style={{ borderColor: FNO_LANDING_BORDER }}>
          <div className="flex w-max animate-marquee gap-12 text-lg font-black tracking-widest text-white/[0.08]">
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i}>FNONINJA</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
