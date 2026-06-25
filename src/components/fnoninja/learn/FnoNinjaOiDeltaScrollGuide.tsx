"use client";

import { FnoNinjaOiDeltaLiveVisual } from "@/components/fnoninja/learn/FnoNinjaOiDeltaLiveVisual";
import {
  LearnBulletList,
  LearnLead,
  LearnSection,
  LearnSteps,
  LearnTerm,
} from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { formatClusterPeakLabel } from "@/lib/levels/format-cluster-size";
import { useLearnNiftyLiveData } from "@/lib/fnoninja/use-learn-nifty-live-data";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export function FnoNinjaOiDeltaScrollGuide() {
  const { levels, candles, loading, candlesLoading } = useLearnNiftyLiveData();

  const putLabel = formatClusterPeakLabel(
    "Put",
    levels?.putClusterSize,
    levels?.putClusterStrike,
    levels?.putClusterChange,
  );
  const callLabel = formatClusterPeakLabel(
    "Call",
    levels?.callClusterSize,
    levels?.callClusterStrike,
    levels?.callClusterChange,
  );

  return (
    <div className="space-y-8">
      <LearnSection title="Start here: what is Open Interest (OI)?">
        <LearnLead>
          When people buy or sell options, some contracts stay open instead of being closed the same day.{" "}
          <strong className="text-slate-200">Open Interest (OI)</strong> is the count of those open contracts
          at a strike.
        </LearnLead>
        <p>
          A big pile of OI at a price level means many participants have positions there. FNO Ninja shows{" "}
          <strong className="text-slate-200">Put OI peak</strong> (support) and{" "}
          <strong className="text-slate-200">Call OI peak</strong> (resistance) on index and stock charts.
        </p>
      </LearnSection>

      <LearnSection title="What is change in OI (Δ OI)?">
        <LearnLead>
          Total OI tells you how big the wall is <strong className="text-slate-200">right now</strong>.{" "}
          <strong className="text-slate-200">Change in OI</strong> tells you what happened{" "}
          <strong className="text-slate-200">today</strong> compared to yesterday&apos;s close.
        </LearnLead>
        <LearnTerm term="▲ OI building (example: ▲12k)">
          More contracts were added at that strike since yesterday. New positioning is arriving at the wall.
        </LearnTerm>
        <LearnTerm term="▼ OI unwinding (example: ▼4k)">
          Contracts were closed or reduced at that strike. Positioning is leaving the wall.
        </LearnTerm>
        <p>
          Compact numbers: <strong className="text-slate-200">12k</strong> = 12,000 contracts,{" "}
          <strong className="text-slate-200">1.2M</strong> = 12 lakh contracts.
        </p>
      </LearnSection>

      <section>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: FNO_ACCENT }}
        >
          Live example · NIFTY
        </p>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3">
          See ▲ and ▼ on a real chart
        </h2>
        <p className="text-sm sm:text-[15px] leading-relaxed mb-5" style={{ color: "#cbd5e1" }}>
          Below is a <strong className="text-slate-200">live NIFTY chart</strong> with today&apos;s cluster
          labels. The arrows at the end of each Put/Call OI peak label are the change in OI — the same
          pattern appears on other indices and NSE stocks when levels come from the option chain.
        </p>
        <FnoNinjaOiDeltaLiveVisual
          levels={levels}
          loading={loading}
          candles={candles}
          candlesLoading={candlesLoading}
        />
      </section>

      <LearnSection title="Where you will see Δ OI">
        <LearnSteps
          steps={[
            {
              title: "On the candle chart (match the example above)",
              body: "Left-side labels on support and resistance bands — e.g. Put OI peak — 225k @ 24,000  ▲12k. The ▲ or ▼ is today's change at that cluster.",
            },
            {
              title: "On Outlook (indices)",
              body: "Inside each green or red block on the forward ladder, a second line shows ▲ or ▼ OI for that expiry's cluster.",
            },
            {
              title: "All indices and NSE stocks",
              body: "Same label format everywhere we derive levels from NSE. Fallback sources may show wall size without delta until refreshed.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="Benefits — why use it?">
        <LearnBulletList
          items={[
            "See not just where the wall is, but whether it is being reinforced or abandoned today.",
            "Support with ▲ put OI may have more defenders — context for an active floor.",
            "Resistance with ▼ call OI may mean the ceiling is softening.",
            "Same NSE feed that builds your zones — no extra data source.",
            "Pair with price on the chart: candles show direction; Δ OI shows positioning at the wall.",
          ]}
        />
      </LearnSection>

      <LearnSection title="To dos — how to use Δ OI">
        <LearnBulletList
          items={[
            "Find the Put or Call OI peak label — read the number after ▲ or ▼.",
            "Compare size and change: a huge wall with small ▲ may be stable; a smaller wall with large ▲ may be building fast.",
            "Check both sides — support building while resistance unwinds (or vice versa) tells a richer story.",
            "Refresh if zones are stale — the chart footer shows when levels were last updated.",
            "On indices, pair with Outlook to see Δ OI across multiple expiries.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Don'ts — what Δ OI does NOT mean">
        <LearnBulletList
          items={[
            "▲ OI does not automatically mean price will go up.",
            "▼ OI does not automatically mean a breakout.",
            "Do not trade on the arrow alone — always look at price action.",
            "Do not expect Δ OI on every symbol every minute — it needs NSE chain change fields.",
            "Do not treat this as financial advice — context for your own judgment only.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Reading today's live NIFTY labels">
        {loading ? (
          <p style={{ color: "#64748b" }}>Loading live cluster labels…</p>
        ) : (
          <>
            <LearnLead>
              {levels?.spot != null ? (
                <>
                  NIFTY spot is around{" "}
                  <strong className="text-slate-200 font-mono">
                    {Math.round(levels.spot).toLocaleString()}
                  </strong>
                  . Right now the chart shows:
                </>
              ) : (
                <>Right now the chart shows:</>
              )}
            </LearnLead>
            {putLabel ? (
              <p className="text-emerald-400/90 font-mono text-sm">{putLabel}</p>
            ) : null}
            {callLabel ? (
              <p className="text-red-400/90 font-mono text-sm">{callLabel}</p>
            ) : null}
            <p className="mt-3">
              Translation: the ▲ or ▼ tells you whether contracts were added or removed at that cluster
              since yesterday&apos;s close. Combine that with the candles above — FNO Ninja shows the data;
              you decide what it means.
            </p>
          </>
        )}
      </LearnSection>
    </div>
  );
}
