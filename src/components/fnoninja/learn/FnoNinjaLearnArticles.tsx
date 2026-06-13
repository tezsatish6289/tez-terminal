"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FnoNinjaLearnScreenshot } from "@/components/fnoninja/learn/FnoNinjaLearnScreenshot";
import { SCIENCE_LEARN_DISCLAIMER } from "@/components/fnoninja/learn/FnoNinjaLearnDisclaimer";
import { FnoNinjaScienceScrollGuide } from "@/components/fnoninja/learn/FnoNinjaScienceScrollGuide";
import { FnoNinjaLiveslideGuide } from "@/components/fnoninja/learn/FnoNinjaLiveslideGuide";
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
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

function useLearnShell(slug: "science" | "liveslide" | "favslide") {
  const pathname = usePathname();
  const article = learnArticleBySlug(slug)!;
  const learnHubHref = fnoLearnHref(pathname);
  return { article, learnHubHref };
}

export function ScienceLearnArticle() {
  const { article, learnHubHref } = useLearnShell("science");

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={learnHubHref}
      disclaimerPlacement="bottom"
      disclaimerParagraphs={SCIENCE_LEARN_DISCLAIMER}
    >
      <FnoNinjaScienceScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}

export function LiveslideLearnArticle() {
  const { article, learnHubHref } = useLearnShell("liveslide");

  return (
    <FnoNinjaLearnArticleShell article={article} learnHubHref={learnHubHref}>
      <LearnSection title="Purpose">
        <LearnLead>
          The <strong className="text-slate-200">Market Map</strong> shows hundreds of NSE F&amp;O
          names at once. <strong className="text-slate-200">Liveslide</strong> is the opposite
          focus: one aligned setup at a time, with a live chart, zone overlays, filters, and news —
          cycling automatically so you can scan the whole market without clicking every symbol.
        </LearnLead>
        <LearnLead>
          &quot;Aligned&quot; means price has reached a meaningful position relative to derived
          support / resistance and Max Pain — the same rules shown on the map. Liveslide exists to
          make that subset effortless to watch. It is for{" "}
          <strong className="text-slate-200">research and monitoring</strong>, not trade signals
          from us.
        </LearnLead>
      </LearnSection>

      <LearnSection title="The advantage">
        <LearnBulletList
          items={[
            "Hands-free: the market comes to you — qualifying setups rotate automatically so you never scroll a giant grid.",
            "Pre-filtered for quality: only zone-qualified setups (a 2:1 reward to Max Pain) ever enter the rotation.",
            "Full chart context: zones, OI peaks, and Max Pain are drawn on a live candlestick chart, not tiny map bubbles.",
            "Focus on your side: filter to support or resistance setups depending on what you are hunting.",
            "Study on demand: pause any slide to read the chart and news for as long as you like.",
          ]}
        />
      </LearnSection>

      <FnoNinjaLiveslideGuide />

      <LearnSection title="Good habits">
        <LearnBulletList
          items={[
            "Treat each slide as a starting point — check expiry, cluster strikes, and your own thesis.",
            "Use pause on symbols you care about; do not rely on auto-cycle speed alone.",
            "Combine with NSE or your broker for execution decisions — FNONINJA does not place trades.",
          ]}
        />
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}

export function FavslideLearnArticle() {
  const { article, learnHubHref } = useLearnShell("favslide");

  return (
    <FnoNinjaLearnArticleShell article={article} learnHubHref={learnHubHref}>
      <LearnSection title="What is Favslide?">
        <LearnLead>
          <strong className="text-slate-200">Favslide</strong> is your personal slideshow. Add
          symbols from any chart, build a shortlist, and cycle through them the same way Liveslide
          cycles the market — but only names <em>you</em> chose.
        </LearnLead>
        <LearnLead>
          It is especially useful when you already have{" "}
          <strong className="text-slate-200">running trades or open positions</strong> and want a
          quick recurring check: Are zones still the same? Where is price vs max pain? What is the
          news flow? You monitor; you decide whether to hold, adjust, or exit.
        </LearnLead>
      </LearnSection>

      <LearnSection title="Who it is for">
        <LearnBulletList
          items={[
            "You follow a fixed watchlist of indices or F&O stocks.",
            "You have open positions and want a repeatable visual check — not advice from us.",
            "You want the Liveslide chart experience limited to names you care about.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Step-by-step">
        <LearnSteps
          steps={[
            {
              title: "Sign in on FNONINJA",
              body: "Favslide is tied to your account so your list persists.",
            },
            {
              title: "Add symbols from a chart",
              body: 'Open a symbol chart (e.g. NIFTY or a stock) and use "Add to favslide" on the toolbar.',
            },
            {
              title: "Open Favslide from the map",
              body: 'On the market map toolbar, tap "Favslide" (keyboard F).',
            },
            {
              title: "Cycle your list",
              body: "Charts, zones, and news advance through your favourites. Pause on any name to study it.",
            },
            {
              title: "Remove names you are done with",
              body: "In Favslide, use remove on the chart chrome when a symbol no longer needs monitoring.",
            },
            {
              title: "Use it for running trades",
              body: "After you enter a trade on your own judgment, add that symbol to favslide and revisit it on a schedule you define. We show structure and context — we do not tell you to hold or exit.",
            },
          ]}
        />
      </LearnSection>

      <div className="space-y-6">
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/favslide-step-1.png"
          alt="Add to favslide on symbol chart"
          caption="Step 1 — Add to favslide from a symbol chart."
          step={1}
        />
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/favslide-step-2.png"
          alt="Favslide toolbar entry on market map"
          caption="Step 2 — Open Favslide from the market map."
          step={2}
        />
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/favslide-step-3.png"
          alt="Favslide cycling a watchlist"
          caption="Step 3 — Cycling a personal watchlist with charts and zones."
          step={3}
        />
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/favslide-step-4.png"
          alt="Monitoring a position in favslide"
          caption="Step 4 — Example: revisiting a symbol you are already tracking for an open position."
          step={4}
        />
      </div>

      <LearnSection title="Monitoring running trades (your process)">
        <LearnLead>
          FNONINJA does not know your positions or P&amp;L. Favslide is a{" "}
          <strong className="text-slate-200">visual checklist</strong> you control:
        </LearnLead>
        <LearnBulletList
          items={[
            "Add the underlying you are trading (index or stock).",
            "On each pass, note price vs support/resistance bands and max pain — has context changed?",
            "Read the news panel for events you might have missed.",
            "Decide your next action yourself; we never provide hold/exit calls.",
          ]}
        />
        <p className="text-sm mt-4">
          <Link href="/levels" className="font-semibold hover:text-white" style={{ color: FNO_ACCENT }}>
            Open market map →
          </Link>{" "}
          to start building a list.
        </p>
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}
