"use client";

import { useEffect, useState } from "react";
import { FnoNinjaSrReplaysShowcase } from "@/components/fnoninja/FnoNinjaSrReplaysShowcase";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import type { SrReplayWithStory } from "@/lib/fnoninja/sr-replay-types";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

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
    <section
      id="real-examples"
      className="border-b"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className={`${FNO_LANDING_SHELL} py-14 sm:py-20 lg:py-24`}>
        <div className="mb-10 sm:mb-12 max-w-3xl">
          <p
            className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
            style={{ color: FNO_ACCENT }}
          >
            Real examples
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
            Put/Call Clusters often act as Support &amp; Resistance zones
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: FNO_MUTED }}>
            Not predictions — observations. Price tends to react around them. Every card below is a
            real, resolved move from a past session.
          </p>
        </div>

        <FnoNinjaSrReplaysShowcase initialReplays={replays} initialSort="best" />
      </div>
    </section>
  );
}
