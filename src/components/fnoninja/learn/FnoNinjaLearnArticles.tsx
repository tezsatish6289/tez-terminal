"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FnoNinjaLearnScreenshot } from "@/components/fnoninja/learn/FnoNinjaLearnScreenshot";
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
    <FnoNinjaLearnArticleShell article={article} learnHubHref={learnHubHref}>
      <LearnSection title="In one minute">
        <LearnLead>
          NSE F&amp;O options are like bets on where an index (like NIFTY) or stock might go by a
          specific date. When lots of traders place similar bets at the{" "}
          <strong className="text-slate-200">same price level</strong> (called a
          &quot;strike&quot;), that level can influence how price moves — not magically, but because
          of how big players (like market makers and institutions) manage their risk.
        </LearnLead>
        <LearnLead>
          FNONINJA scans the public option chain and highlights:
        </LearnLead>
        <LearnBulletList
          items={[
            "Heavy put interest below current price (potential support)",
            "Heavy call interest above current price (potential resistance)",
            "Max pain level (a reference point near expiry)",
          ]}
        />
        <LearnLead>
          We draw easy-to-see zones so you can compare them to live price action and decide what
          they mean for you.
        </LearnLead>
      </LearnSection>

      <LearnSection title="Key ideas explained simply (for beginners)">
        <div className="space-y-4">
          <LearnTerm term="1. Put cluster (potential support zone)">
            <p>
              Puts are options that gain value when the price <strong className="text-slate-200">falls</strong>.
              Many traders buy puts for protection or to bet on a drop.
            </p>
            <p className="mt-3">
              When a huge number of puts pile up at one strike{" "}
              <strong className="text-slate-200">below</strong> the current price, we call it a{" "}
              <strong className="text-slate-200">put cluster</strong>. On FNONINJA you&apos;ll see
              something like <em>Put OI peak — 221k @ 22,500</em> (221 thousand contracts at the
              22,500 strike).
            </p>
            <p className="mt-3">
              We shade a <strong className="text-slate-200">support zone</strong> around it.
            </p>
            <p className="mt-3">
              <strong className="text-slate-200">Why it can act as support:</strong> Large open
              interest often means market makers (who sell these options) hedge their risk by buying
              the underlying when price dips toward that level. This buying can slow down or pause a
              fall — like a cushion. It&apos;s an observation from history and data,{" "}
              <strong className="text-slate-200">not a guarantee</strong> that price will bounce.
            </p>
          </LearnTerm>

          <LearnTerm term="2. Call cluster (potential resistance zone)">
            <p>
              Calls are options that gain value when the price{" "}
              <strong className="text-slate-200">rises</strong>.
            </p>
            <p className="mt-3">
              A <strong className="text-slate-200">call cluster</strong> happens when lots of calls
              stack at a strike <strong className="text-slate-200">above</strong> current price.
              Example label: <em>Call OI peak — 164k @ 24,000</em>.
            </p>
            <p className="mt-3">
              We draw a <strong className="text-slate-200">resistance zone</strong> around it.
            </p>
            <p className="mt-3">
              <strong className="text-slate-200">Why it can act as resistance:</strong> Market makers
              hedging these sold calls may sell the underlying as price rises toward the strike. This
              selling pressure can make it harder for price to break through — like hitting a
              ceiling. Again, just context for your chart, not a guaranteed wall.
            </p>
          </LearnTerm>

          <LearnTerm term="3. Max pain">
            <p>
              At expiry, options settle based on the closing price.{" "}
              <strong className="text-slate-200">Max pain</strong> is the strike where the{" "}
              <strong className="text-slate-200">total payout</strong> by option sellers (writers)
              would be the lowest — meaning the most options (calls + puts) would expire worthless.
            </p>
            <p className="mt-3">
              We show it as a yellow line. Many researchers notice price tends to hover or
              &quot;pin&quot; near max pain as expiry nears, but it&apos;s{" "}
              <strong className="text-slate-200">not a rule</strong> — just one useful reference
              point.
            </p>
          </LearnTerm>

          <LearnTerm term="4. Expiry">
            <p>
              Every option has an expiry date (when the contract ends). FNONINJA uses the nearest
              liquid expiry (e.g. <em>16/06/2026 Expiry</em> shown on the chart). Clusters and max
              pain can shift when a new expiry becomes active. Always match the expiry when checking
              NSE.
            </p>
          </LearnTerm>
        </div>
      </LearnSection>

      <LearnSection title="How price often reacts around these levels (and why)">
        <LearnLead>
          Markets aren&apos;t robots, but heavy option activity creates real effects through{" "}
          <strong className="text-slate-200">hedging</strong> by market makers — the big
          intermediaries who take the other side of trades.
        </LearnLead>
        <p className="text-sm font-semibold text-white mt-4">Around put / call clusters</p>
        <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          High open interest (OI) means lots of contracts. Market makers hedge to stay safe. As price
          approaches a heavy put zone, their hedging often involves <strong className="text-slate-200">buying</strong>{" "}
          (support). Near heavy calls, hedging can mean <strong className="text-slate-200">selling</strong>{" "}
          (resistance). Result: price may <strong className="text-slate-200">slow down, pause, or reverse</strong>{" "}
          temporarily. Breaks beyond the zone can trigger more hedging adjustments, sometimes
          accelerating the move.
        </p>
        <p className="text-sm font-semibold text-white mt-4">Near max pain (especially near expiry)</p>
        <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          It acts like a <strong className="text-slate-200">magnet</strong>. Dealers&apos; collective
          hedging flows (buying dips and selling rallies to stay neutral) tend to pull price toward
          areas of concentrated open interest. This &quot;pinning&quot; effect is stronger in the last
          few days before expiry when gamma (sensitivity to price moves) increases. Price doesn&apos;t{" "}
          <em>have</em> to go there, especially if big news or trends overpower it — but it&apos;s a
          common pattern many researchers watch.
        </p>
        <p className="text-sm font-semibold text-white mt-4">Patterns researchers often notice</p>
        <LearnBulletList
          items={[
            "Price often respects these zones more in calm markets.",
            "Strong moves through a zone can lead to repositioning — the cluster may update on the next refresh.",
            "These levels are dynamic — they change with new data and trader positions.",
            "Always combine with your own tools: trend, news, volume, chart support/resistance, and risk management.",
          ]}
        />
        <LearnLead>
          <strong className="text-slate-200">Bottom line:</strong> These zones give you a map of where
          big money has placed bets and is managing risk. They add context — not crystal balls.
        </LearnLead>
      </LearnSection>

      <LearnSection title="Sample NIFTY chart (annotated)">
        <LearnLead>
          Below is a real NIFTY chart from FNONINJA with live-style labels. On the product, numbers
          update from fresh NSE option-chain data.
        </LearnLead>
        <div
          className="rounded-xl p-4 sm:p-5 text-sm space-y-2 mb-4"
          style={{
            backgroundColor: "rgba(8,15,30,0.45)",
            border: "1px solid rgba(90,140,220,0.12)",
            color: "#94a3b8",
          }}
        >
          <p className="font-bold text-white">NIFTY · 15m · NSE</p>
          <p>
            <span style={{ color: "#fca5a5" }}>Call OI peak — 164k @ 24,000</span> (resistance zone)
          </p>
          <p>
            <span style={{ color: "#fbbf24" }}>Max Pain · 16/06/2026 Expiry</span> (yellow line @
            23,500)
          </p>
          <p>
            <span style={{ color: "#86efac" }}>Put OI peak — 221k @ 22,500</span> (support zone)
          </p>
        </div>
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/science-chart.png"
          alt="NIFTY 15m chart on FNONINJA showing call cluster, put cluster, max pain, and support/resistance zones"
          caption="Live NIFTY example — support and resistance derived from option chain data expiring on 16/06/2026. Levels update as new NSE data arrives."
        />
      </LearnSection>

      <LearnSection title="Verify it yourself (easy 4-step process)">
        <LearnSteps
          steps={[
            {
              title: "Note the levels on FNONINJA",
              body: "Example: Put OI peak @ 22,500, Call OI peak @ 24,000, expiry 16/06/2026.",
            },
            {
              title: "Go to NSE option chain",
              body: "Search NIFTY and select the exact same expiry.",
            },
            {
              title: "Check open interest",
              body: "Look at the strike in the Put or Call column. The contract count should be roughly similar (markets move fast, so small differences are normal).",
            },
            {
              title: "Form your own view",
              body: "Does this level align with other signals on your chart? Does it fit your timeframe and strategy? Use the zones as extra context — you decide.",
            },
          ]}
        />
      </LearnSection>
    </FnoNinjaLearnArticleShell>
  );
}

export function LiveslideLearnArticle() {
  const { article, learnHubHref } = useLearnShell("liveslide");

  return (
    <FnoNinjaLearnArticleShell article={article} learnHubHref={learnHubHref}>
      <LearnSection title="What is Liveslide?">
        <LearnLead>
          The <strong className="text-slate-200">Market Map</strong> shows hundreds of NSE F&amp;O
          names at once. <strong className="text-slate-200">Liveslide</strong> is the opposite
          focus: one aligned setup at a time, with a live chart, zone overlays, filters, and news —
          cycling automatically so you can scan without clicking every symbol.
        </LearnLead>
        <LearnLead>
          &quot;Aligned&quot; means price is in a meaningful position relative to derived support /
          resistance and max pain (the same rules shown on the map). Liveslide is for{" "}
          <strong className="text-slate-200">research and monitoring</strong>, not trade signals
          from us.
        </LearnLead>
      </LearnSection>

      <LearnSection title="Who it is for">
        <LearnBulletList
          items={[
            "You want a hands-free tour of names that meet your filter right now.",
            "You are learning how zones look on real charts across indices and stocks.",
            "You prefer full-screen chart context instead of tiny map bubbles.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Step-by-step">
        <LearnSteps
          steps={[
            {
              title: "Open the market map and sign in",
              body: "Liveslide requires a free Google sign-in on FNONINJA. The map itself stays public.",
            },
            {
              title: "Switch to Liveslide",
              body: 'Tap the "Liveslide" control in the toolbar (keyboard shortcut L).',
            },
            {
              title: "Pick a filter",
              body: "Use All aligned, Bullish, or Bearish to narrow which setups appear in the rotation.",
            },
            {
              title: "Watch the chart and strip",
              body: "Each slide shows the symbol, zones, put/call OI peaks, max pain, and a news panel. The strip at the top lets you jump to a specific name.",
            },
            {
              title: "Pause when you want to study",
              body: "Use the pause control to stop auto-advance while you read the chart or news.",
            },
            {
              title: "Open a deep-dive chart",
              body: "From the map or search, open any symbol chart for more detail — still your analysis, not our recommendation.",
            },
          ]}
        />
      </LearnSection>

      <div className="space-y-6">
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/liveslide-step-1.png"
          alt="Market map with Liveslide button"
          caption="Step 1 — Market map toolbar with Liveslide entry."
          step={1}
        />
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/liveslide-step-2.png"
          alt="Liveslide view with chart and filters"
          caption="Step 2 — Liveslide with chart, filters, and symbol strip."
          step={2}
        />
        <FnoNinjaLearnScreenshot
          src="/fnoninja/learn/liveslide-step-3.png"
          alt="Paused Liveslide on a single symbol"
          caption="Step 3 — Paused on one symbol to study zones and news."
          step={3}
        />
      </div>

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
