"use client";

import { useEffect, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { FnoNinjaOutlookLiveVisual } from "@/components/fnoninja/learn/FnoNinjaOutlookLiveVisual";
import {
  LearnBulletList,
  LearnLead,
  LearnSection,
  LearnSteps,
  LearnTerm,
} from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { INDEX_SPECS } from "@/lib/index-specs";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

const EXAMPLE_SYMBOL = "NIFTY";

export function FnoNinjaOutlookScrollGuide() {
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { indices?: { symbol?: string; label: string; data: PublicLevels | null }[] }) => {
        if (cancelled) return;
        const hit = json.indices?.find(
          (it) => (it.symbol ?? it.label).toUpperCase() === EXAMPLE_SYMBOL,
        );
        setLevels(hit?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLevels(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexList = Object.values(INDEX_SPECS)
    .map((s) => s.label)
    .join(", ");

  return (
    <div className="space-y-8">
      <LearnSection title="What is Outlook? (in plain English)">
        <LearnLead>
          Most charts show you what happened <strong className="text-slate-200">yesterday and today</strong>.
          <strong className="text-slate-200"> Outlook</strong> is different: a forward map of where option
          positioning puts <strong className="text-slate-200">support</strong>,{" "}
          <strong className="text-slate-200">resistance</strong>, and{" "}
          <strong className="text-slate-200">max pain</strong> across the{" "}
          <strong className="text-slate-200">next few expiry dates</strong>.
        </LearnLead>
        <p>
          It is available on <strong className="text-slate-200">every NSE index</strong> we cover — not just
          one symbol. Think of it as a calendar of option walls, not a day-by-day price prediction.
        </p>
      </LearnSection>

      <LearnSection title="Which indices have Outlook?">
        <LearnLead>
          Open any index chart and use the <strong className="text-slate-200">Chart → Outlook</strong> toggle.
          Supported indices include:
        </LearnLead>
        <p className="text-slate-300">{indexList}.</p>
        <p>
          Each index uses its own NSE option chain. Weekly vs monthly expiries differ by index — Outlook always
          shows the next expiries we derive from live data for that symbol.
        </p>
      </LearnSection>

      <section>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: FNO_ACCENT }}
        >
          Live example · {EXAMPLE_SYMBOL}
        </p>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3">
          See Outlook on a real chart
        </h2>
        <p className="text-sm sm:text-[15px] leading-relaxed mb-5" style={{ color: "#cbd5e1" }}>
          Below is a <strong className="text-slate-200">live {EXAMPLE_SYMBOL} Outlook</strong> from today&apos;s
          NSE data. Bank Nifty, Fin Nifty, and the other indices use the same layout — only the levels and
          dates change. Scroll the breakdown under the chart to match each expiry to its bands.
        </p>
        <FnoNinjaOutlookLiveVisual
          levels={levels}
          loading={loading}
          symbol={EXAMPLE_SYMBOL}
          indexLabel={INDEX_SPECS.NIFTY.label}
        />
      </section>

      <LearnSection title="How to read the ladder (match the chart above)">
        <LearnTerm term="Today (left edge)">
          The starting anchor. The first time slot uses the nearest expiry&apos;s option chain until the next
          expiry date on the axis.
        </LearnTerm>
        <LearnTerm term="Green block = support">
          Put OI cluster band for that expiry window — where the market has stacked puts below spot. Thicker
          borders and size labels (e.g. 225k @ 24,000) mean a heavier wall.
        </LearnTerm>
        <LearnTerm term="Red block = resistance">
          Call OI cluster band above spot for that expiry. Same wall-size labels apply.
        </LearnTerm>
        <LearnTerm term="Yellow stepped line = max pain">
          Strike where option writers would lose least at that expiry. It can step up or down between expiries —
          that is normal when the next chain owns different strikes.
        </LearnTerm>
        <LearnTerm term="Confident → Softening → Speculative">
          Labels under each expiry date. Nearest expiry is most liquid; far weeks fade on the chart because
          their OI is thinner and shifts more easily.
        </LearnTerm>
      </LearnSection>

      <LearnSection title="Why steps, not slopes">
        <LearnLead>
          Each expiry has its <strong className="text-slate-200">own</strong> support, resistance, and max pain.
        </LearnLead>
        <p>
          We draw flat blocks between dates and a vertical step at each expiry boundary. Levels do not smoothly
          interpolate — when the 7 Jul chain takes over from 30 Jun, bands can jump. That step is the feature
          working correctly, not missing data.
        </p>
      </LearnSection>

      <LearnSection title="How to open Outlook on any index">
        <LearnSteps
          steps={[
            {
              title: "Open an index chart",
              body: "From the market map, pick any index — NIFTY, Bank Nifty, Fin Nifty, Midcap Nifty, or Nifty Next 50.",
            },
            {
              title: "Switch to Outlook",
              body: "Tap Chart → Outlook above the chart. The candle view swaps to the forward ladder for that index.",
            },
            {
              title: "Read left to right",
              body: "Today on the left, expiry dates on the axis. Use Chart when you need candles; use Outlook when you need structure across expiries.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="Benefits — why use it?">
        <LearnBulletList
          items={[
            "See multiple expiries at once instead of switching the expiry picker one by one.",
            "Compare how support, resistance, and max pain shift between expiries on the same index.",
            "Wall size labels show how heavy each level is — thicker borders mean stronger OI concentration.",
            "Works on all supported NSE indices with the same visual language.",
            "Confidence fade reminds you that far-dated expiries are less reliable than the front week.",
          ]}
        />
      </LearnSection>

      <LearnSection title="To dos — how to read it well">
        <LearnBulletList
          items={[
            "Start with the nearest expiry (left side) — that is where the most liquid positioning lives.",
            "Match each vertical line on the chart to the expiry rows in the live breakdown below the example.",
            "Use Chart for price action; use Outlook for structure across time on the same index.",
            "Switch indices from the market map — Outlook is not limited to NIFTY.",
            "Check the footer timestamp on the chart page — zones refresh during market hours when NSE data updates.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Don'ts — common mistakes">
        <LearnBulletList
          items={[
            "Do not treat Outlook as a forecast that the index will follow that path day by day.",
            "Do not assume the NIFTY example dates and levels apply to Bank Nifty or other indices — open each symbol.",
            "Do not give Speculative expiries the same weight as Confident ones.",
            "Do not ignore the regular chart — Outlook has no candles; price can break levels anytime.",
            "Do not use this as buy/sell advice — it is informational context for your own analysis.",
          ]}
        />
      </LearnSection>
    </div>
  );
}
