"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FnoNinjaLearnArticleShell,
  LearnBulletList,
  LearnLead,
  LearnSection,
  LearnSteps,
  LearnTerm,
} from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "FNONINJA shows derived observations from publicly available NSE option-chain data.",
  "We do not provide investment advice, trading recommendations, buy/sell signals, or price predictions.",
  "Support, resistance, and max pain levels are reference points from option positioning — not guarantees that price will bounce or reverse.",
  "Always do your own research and manage your own risk.",
];

export function FnoNinjaMethodologyLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("methodology")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="bottom"
      disclaimerParagraphs={DISCLAIMER}
    >
      <LearnSection title="The idea in one sentence">
        <LearnLead>
          We look at where lots of options are sitting on the NSE option chain, then mark those
          strikes on a chart as{" "}
          <strong className="text-slate-200">possible support</strong>,{" "}
          <strong className="text-slate-200">possible resistance</strong>, and{" "}
          <strong className="text-slate-200">max pain</strong> — so you can see market positioning
          without scanning hundreds of strikes by hand.
        </LearnLead>
      </LearnSection>

      <LearnSection title="What data do we use?">
        <LearnLead>
          Public <strong className="text-slate-200">NSE option-chain</strong> data for F&amp;O stocks
          and indices (like NIFTY and BANKNIFTY).
        </LearnLead>
        <LearnBulletList
          items={[
            "Open interest (OI) — how many option contracts are still open at each strike",
            "The current spot (or underlying) price",
            "The expiry date you are looking at (this week, next week, monthly, and so on)",
          ]}
        />
        <p>
          We do <strong className="text-slate-200">not</strong> use private broker data, tip lines, or
          “secret” signals. Same kind of chain data anyone can check on the exchange side.
        </p>
      </LearnSection>

      <LearnSection title="How we build a level (3 steps)">
        <LearnSteps
          steps={[
            {
              title: "Read the option chain",
              body: "For a symbol and expiry, we load put and call open interest at each strike price.",
            },
            {
              title: "Find the heavy spots",
              body: "Below the current price, we find the strike with the most put OI. Above the current price, we find the strike with the most call OI. We also compute max pain — the strike where option writers as a group would lose the least if price finished there at expiry.",
            },
            {
              title: "Draw bands on the chart",
              body: "Those strikes become the levels you see: a support-style band around the put wall, a resistance-style band around the call wall, and a max-pain reference. The map and charts refresh as the chain updates during the session.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="The three levels, in plain English">
        <div className="space-y-4">
          <LearnTerm term="Put cluster → often read as support">
            <p>
              A <strong className="text-slate-200">put</strong> is an option that pays if price falls.
              When many puts pile up at one strike{" "}
              <strong className="text-slate-200">below</strong> the market, that strike can act like a
              floor people are defending — we show it as a{" "}
              <strong className="text-slate-200">support</strong> / put-wall zone.
            </p>
          </LearnTerm>
          <LearnTerm term="Call cluster → often read as resistance">
            <p>
              A <strong className="text-slate-200">call</strong> is an option that pays if price rises.
              When many calls pile up at one strike{" "}
              <strong className="text-slate-200">above</strong> the market, that strike can act like a
              ceiling — we show it as a{" "}
              <strong className="text-slate-200">resistance</strong> / call-wall zone.
            </p>
          </LearnTerm>
          <LearnTerm term="Max pain → a reference magnet near expiry">
            <p>
              <strong className="text-slate-200">Max pain</strong> is a calculated strike: if the
              underlying finished exactly there at expiry, total payout by option writers would be
              smallest. Near expiry, price sometimes drifts toward it — useful context, not a
              promise.
            </p>
          </LearnTerm>
        </div>
      </LearnSection>

      <LearnSection title="Why a “band” and not a single line?">
        <LearnLead>
          Markets rarely pin exactly on one rupee. We draw a{" "}
          <strong className="text-slate-200">zone</strong> around the heavy strike so you see a
          neighborhood, not a laser line.
        </LearnLead>
        <p>
          Band width is based on how we size zones for that symbol (indices and stocks can differ).
          Wider or tighter does <strong className="text-slate-200">not</strong> mean “guaranteed bounce
          size.”
        </p>
      </LearnSection>

      <LearnSection title="How often do levels update?">
        <LearnBulletList
          items={[
            "During market hours, levels refresh as option-chain open interest updates",
            "After an expiry, structure rebuilds from the next active chain",
            "Quiet or illiquid names may show fewer or weaker walls — that is expected",
          ]}
        />
      </LearnSection>

      <LearnSection title="What this is not">
        <LearnBulletList
          items={[
            "Not a buy or sell signal",
            "Not a prediction that price will reverse at the wall",
            "Not SEBI-registered research advice or personalized recommendations",
            "Not a substitute for your own charting, risk rules, and judgment",
          ]}
        />
        <p>
          Think of FNONINJA as a{" "}
          <strong className="text-slate-200">map of where options are stacked</strong> — you decide
          what to do with that map.
        </p>
      </LearnSection>

      <LearnSection title="Want to go deeper?">
        <p>
          This page is the short “how we build it” version. For more detail on clusters and expiry,
          see{" "}
          <Link
            href={fnoLearnHref(pathname, "science")}
            className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2"
          >
            Option zones science
          </Link>
          . For change-in-OI arrows on the chart, see{" "}
          <Link
            href={fnoLearnHref(pathname, "oi-delta")}
            className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2"
          >
            Change in OI at the wall
          </Link>
          .
        </p>
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}
