"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell, LearnBulletList, LearnLead, LearnSection, LearnSteps, LearnTerm } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "Change in OI is positioning context from NSE option-chain data — not a buy or sell signal. FNONINJA does not recommend trades.",
];

export function FnoNinjaOiDeltaLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("oi-delta")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="top"
      disclaimerParagraphs={DISCLAIMER}
    >
      <LearnSection title="Start here: what is Open Interest (OI)?">
        <LearnLead>
          When people buy or sell options, some of those contracts stay open instead of being closed the
          same day. <strong className="text-slate-200">Open Interest (OI)</strong> is simply the count of
          those open contracts at a strike.
        </LearnLead>
        <p>
          A big pile of OI at a price level means many participants have positions there. That is why FNO
          Ninja already shows <strong className="text-slate-200">Put OI peak</strong> (support) and{" "}
          <strong className="text-slate-200">Call OI peak</strong> (resistance) on your chart.
        </p>
      </LearnSection>

      <LearnSection title="What is &ldquo;change in OI&rdquo; (Δ OI)?">
        <LearnLead>
          Total OI tells you how big the wall is <strong className="text-slate-200">right now</strong>.
          <strong className="text-slate-200"> Change in OI</strong> tells you what happened{" "}
          <strong className="text-slate-200">today</strong> compared to yesterday's close.
        </LearnLead>
        <LearnTerm term="▲ OI building (example: ▲12k)">
          More contracts were added at that strike since yesterday. New positioning is arriving at the
          wall — the level is getting attention.
        </LearnTerm>
        <LearnTerm term="▼ OI unwinding (example: ▼4k)">
          Contracts were closed or reduced at that strike. Positioning is leaving — the wall may be getting
          weaker.
        </LearnTerm>
        <p>
          We use compact numbers: <strong className="text-slate-200">12k</strong> means 12,000 contracts,{" "}
          <strong className="text-slate-200">1.2M</strong> means 12 lakh contracts.
        </p>
      </LearnSection>

      <LearnSection title="Where you will see it">
        <LearnSteps
          steps={[
            {
              title: "On the candle chart",
              body: "Look at the left-side labels on support and resistance bands — e.g. Put OI peak — 225k @ 24,000  ▲12k. The ▲ or ▼ at the end is today's change at that cluster.",
            },
            {
              title: "On Outlook (indices)",
              body: "Inside each green or red block on the ladder, a second line shows ▲ or ▼ OI for that expiry's cluster.",
            },
            {
              title: "Indices and NSE stocks",
              body: "Data comes from NSE option chain. If a stock level was computed from a fallback source without change data, the delta may not appear until NSE data is refreshed.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="Why it helps (benefits)">
        <LearnBulletList
          items={[
            "You see not just where the wall is, but whether it is being reinforced or abandoned today.",
            "A support level with ▲ put OI may have more defenders showing up — context for whether the floor is active.",
            "A resistance level with ▼ call OI may mean sellers are peeling off — the ceiling could be softening.",
            "It updates from the same NSE feed that builds your zones — no extra data source to trust.",
            "Works alongside price on the chart: you watch candles; the label tells you what option flow is doing at the wall.",
          ]}
        />
      </LearnSection>

      <LearnSection title="To dos — how to use Δ OI">
        <LearnBulletList
          items={[
            "Find the Put or Call OI peak label on your chart — read the number after ▲ or ▼.",
            "Compare size and change together: a huge wall (225k) with small ▲ may be stable; a smaller wall with large ▲ may be building fast.",
            "Check both sides — support building while resistance unwinding (or vice versa) tells a richer story than one label alone.",
            "Refresh during the session if zones are stale — the footer shows when levels were last updated.",
            "Pair with Outlook on indices to see how Δ OI looks across multiple expiries.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Don'ts — what Δ OI does NOT mean">
        <LearnBulletList
          items={[
            "▲ OI does not automatically mean price will go up — rising OI at support often means writers defending, but it can also mean buyers betting on a breakdown.",
            "▼ OI does not automatically mean a breakout — it can mean profit-taking, not necessarily a failed level.",
            "Do not trade on the arrow alone — always look at price action on the chart.",
            "Do not expect Δ OI on every symbol every minute — it appears when NSE chain data includes change fields.",
            "Do not treat this as financial advice — it is one observation among many for your own judgment.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Quick example (beginner walkthrough)">
        <LearnLead>
          NIFTY is near 24,000. The chart shows:
        </LearnLead>
        <p>
          <strong className="text-emerald-400/90">Put OI peak — 225k @ 24,000  ▲12k</strong>
        </p>
        <p>
          Translation: the biggest put concentration sits at 24,000 (your support cluster). Today, about
          12,000 more put contracts were added there vs yesterday's close. The floor is getting{" "}
          <strong className="text-slate-200">more crowded</strong> — worth noting, but not a guarantee
          price will bounce.
        </p>
        <p>
          Now check the chart: is price holding above 24,000 or pushing through?{" "}
          <strong className="text-slate-200">You</strong> combine the label and the candles — FNO Ninja
          shows the data; you decide what it means.
        </p>
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}
