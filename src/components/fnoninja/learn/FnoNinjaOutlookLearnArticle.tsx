"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell, LearnBulletList, LearnLead, LearnSection, LearnSteps, LearnTerm } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "Outlook shows derived option-chain data — not a price forecast. FNONINJA does not recommend trades or predict where NIFTY will go.",
];

export function FnoNinjaOutlookLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("outlook")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="top"
      disclaimerParagraphs={DISCLAIMER}
    >
      <LearnSection title="What is Outlook? (in plain English)">
        <LearnLead>
          Most charts show you what happened <strong className="text-slate-200">yesterday and today</strong>.
          <strong className="text-slate-200"> Outlook</strong> shows something different: where option traders have
          built their biggest <strong className="text-slate-200">support</strong>,{" "}
          <strong className="text-slate-200">resistance</strong>, and{" "}
          <strong className="text-slate-200">max pain</strong> levels across the{" "}
          <strong className="text-slate-200">next few expiry dates</strong>.
        </LearnLead>
        <p>
          Think of it as a simple forward map — not a prediction, but a picture of where the option market
          is &ldquo;stacked&rdquo; over time.
        </p>
      </LearnSection>

      <LearnSection title="Three things on the map (you already know two)">
        <LearnTerm term="Support (green)">
          A price zone where many <strong className="text-slate-300">Put</strong> options are concentrated
          below the current price. Traders often watch these as possible floors.
        </LearnTerm>
        <LearnTerm term="Resistance (red)">
          A price zone where many <strong className="text-slate-300">Call</strong> options sit above the
          current price. Traders often watch these as possible ceilings.
        </LearnTerm>
        <LearnTerm term="Max pain (yellow dashed line)">
          The strike where option writers would lose the least if the market settled there on expiry. It is
          a reference point — not a guaranteed target.
        </LearnTerm>
      </LearnSection>

      <LearnSection title="Why it looks like a ladder (not a slope)">
        <LearnLead>
          Each upcoming expiry has its <strong className="text-slate-200">own</strong> support, resistance,
          and max pain — computed from that expiry's option chain.
        </LearnLead>
        <p>
          We draw each expiry as a <strong className="text-slate-200">flat block</strong> between dates, with
          a step at each expiry boundary. That is intentional: levels do not smoothly glide from one week to
          the next — they can jump when a new expiry's chain takes over.
        </p>
      </LearnSection>

      <LearnSection title="How to open Outlook">
        <LearnSteps
          steps={[
            {
              title: "Open an index chart",
              body: "Go to any index — for example NIFTY — from the market map or open /levels/chart?scope=index&symbol=NIFTY.",
            },
            {
              title: "Switch to Outlook",
              body: "At the top of the chart area, tap Chart → Outlook. The candle chart is replaced by the forward ladder.",
            },
            {
              title: "Read left to right",
              body: "Today is on the left. Each vertical line is an expiry date (e.g. 30 Jun, 7 Jul). Labels under each date show how confident that slice is: Confident → Softening → Speculative.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="Benefits — why use it?">
        <LearnBulletList
          items={[
            "See multiple expiries at once instead of switching the expiry picker one by one.",
            "Spot when support or resistance shifts between weeks — a step on the ladder means the next expiry's chain owns different strikes.",
            "Compare max pain across expiries — does the \"magnet\" stay near the same price or move?",
            "Wall size labels (e.g. 225k @ 24,000) show how heavy each level is — thicker borders mean a stronger OI wall.",
            "Confidence fade reminds you that far-dated expiries are thinner and change more easily.",
          ]}
        />
      </LearnSection>

      <LearnSection title="To dos — how to read it well">
        <LearnBulletList
          items={[
            "Start with the nearest expiry (left side) — that is where the most liquid option positioning lives.",
            "Note the green support block and red resistance block for each time slot — that is the range FNO Ninja derived for that expiry.",
            "Watch the yellow max-pain steps — if they stay flat, the market's \"centre of gravity\" is stable across weeks.",
            "Use the regular Chart view for price action; use Outlook for structure across time.",
            "Check the footer timestamp — zones refresh during market hours when new NSE data arrives.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Don'ts — common mistakes">
        <LearnBulletList
          items={[
            "Do not treat Outlook as a forecast that NIFTY will follow that path day by day.",
            "Do not give the same weight to Speculative expiries as to Confident ones — far weeks have less reliable OI.",
            "Do not ignore the regular chart — Outlook has no candles; price can break levels anytime.",
            "Do not assume max pain is a target — strong trends and news can ignore it completely.",
            "Do not use this as buy/sell advice — it is informational context for your own analysis.",
          ]}
        />
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}
