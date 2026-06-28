"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FnoNinjaHistoryLiveVisual } from "@/components/fnoninja/learn/FnoNinjaHistoryLiveVisual";
import { FnoNinjaLearnVerifyChecklist } from "@/components/fnoninja/learn/FnoNinjaLearnVerifyChecklist";
import {
  LearnBulletList,
  LearnLead,
  LearnSection,
  LearnSteps,
  LearnTerm,
} from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { INDEX_KEYS, INDEX_SPECS, type IndexKey } from "@/lib/index-specs";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

function historyChartHref(pathname: string, symbol: IndexKey): string {
  if (typeof window !== "undefined") {
    return levelsChartPagePathForHost(window.location.hostname, "index", symbol, null, "history");
  }
  if (pathname.startsWith("/fnoninja")) {
    return `/fnoninja/levels/chart?scope=index&symbol=${symbol}&view=history`;
  }
  return `/levels/chart?scope=index&symbol=${symbol}&view=history`;
}

function HistoryIndexLinks() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 not-prose">
      {INDEX_KEYS.map((key) => (
        <Link
          key={key}
          href={historyChartHref(pathname, key)}
          className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-colors hover:bg-white/[0.04]"
          style={{
            color: "#e2e8f0",
            border: "1px solid rgba(96,165,250,0.22)",
            backgroundColor: "rgba(8,15,30,0.45)",
          }}
        >
          <span>{INDEX_SPECS[key].label}</span>
          <span className="text-xs font-mono" style={{ color: FNO_ACCENT }}>
            History →
          </span>
        </Link>
      ))}
    </div>
  );
}

export function FnoNinjaHistoryScrollGuide() {
  return (
    <div className="space-y-8">
      <LearnSection title="What is History mode?">
        <LearnLead>
          The live chart shows <strong className="text-slate-200">today&apos;s</strong> put wall, call wall,
          and max pain. <strong className="text-slate-200">History</strong> replays how those levels moved
          day by day — up to six months of end-of-day option data on each NSE index.
        </LearnLead>
        <p>
          Blue candles are price. Green is the put wall (support), red is the call wall (resistance), yellow
          dashed is max pain. Hover any day for strikes, OI, and put-vs-call dominance — no guesswork from
          static screenshots.
        </p>
      </LearnSection>

      <LearnSection title="Patterns traders often verify (not promises)">
        <LearnLead>
          When you scroll through History on NIFTY, Bank Nifty, and the other indices, these relationships
          show up often enough that many traders use them as <strong className="text-slate-200">structure to
          validate</strong> — not as automatic buy/sell triggers.
        </LearnLead>
        <LearnBulletList
          items={[
            "Price tends to gravitate toward max pain — especially into expiry week (watch the yellow dashed line vs blue candles).",
            "Put OI build-up on the green wall — visible as line thickening — often precedes bullish follow-through; verify on the days before up-moves.",
            "Call OI build-up on the red wall — line thickening — often precedes bearish pressure or failed breakouts above resistance.",
            "The put ↔ call glow (green or red halo on the heavier side) can flag shifting dominance before price reacts — strength tracks the % gap between wall OI.",
          ]}
        />
        <p className="text-xs pt-1" style={{ color: "#64748b" }}>
          Past structure does not guarantee future outcomes. Use History to cross-check what you see today,
          not to predict tomorrow.
        </p>
      </LearnSection>

      <LearnSection title="How to read the chart">
        <LearnTerm term="Put wall (green)">
          Highest put open interest below spot that day — the dominant support strike from the front expiry.
        </LearnTerm>
        <LearnTerm term="Call wall (red)">
          Highest call open interest above spot — the dominant resistance strike from the front expiry.
        </LearnTerm>
        <LearnTerm term="Max pain (yellow dashed)">
          Strike where total option payout would be lowest if the index settled there on expiry.
        </LearnTerm>
        <LearnTerm term="Thickness = OI momentum">
          Each wall line gets thicker when that side&apos;s OI <strong className="text-slate-200">builds</strong> day
          over day, and thinner when it <strong className="text-slate-200">decays</strong>. That is cumulative
          positioning pressure on that wall — not just today&apos;s static size.
        </LearnTerm>
        <LearnTerm term="Glow = put vs call dominance">
          Only the heavier side glows — green when puts lead, red when calls lead. Brighter halo = wider %
          gap between put and call wall OI. When glow flips sides, dominance may be shifting.
        </LearnTerm>
      </LearnSection>

      <section>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: FNO_ACCENT }}
        >
          Live example · NIFTY
        </p>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3">
          Explore six months on a real chart
        </h2>
        <p className="text-sm sm:text-[15px] leading-relaxed mb-5" style={{ color: "#cbd5e1" }}>
          Below is a <strong className="text-slate-200">live NIFTY History</strong> view. Use{" "}
          <strong className="text-slate-200">1M / 3M / 6M</strong> to zoom the window, hover a day for OI
          detail, and read the guide footer for thickness and glow. Press{" "}
          <strong className="text-slate-200">H</strong> on any index chart page to jump here.
        </p>
        <FnoNinjaHistoryLiveVisual />
      </section>

      <LearnSection title="Open History on every index">
        <LearnLead>
          The same History mode is available for all five NSE indices we track. Each link opens the chart
          directly on the History tab — explore and validate on your own.
        </LearnLead>
        <HistoryIndexLinks />
      </LearnSection>

      <LearnSection title="How to open History (step by step)">
        <LearnSteps
          steps={[
            {
              title: "Open an index chart",
              body: "From the market map, pick NIFTY, Bank Nifty, Fin Nifty, Midcap Nifty, or Nifty Next 50.",
            },
            {
              title: "Switch to History",
              body: "Tap Chart → History above the chart, or press H on your keyboard.",
            },
            {
              title: "Pick a time window",
              body: "Use 1M, 3M, or 6M to focus on recent structure or the full stored series (~120 trading days).",
            },
            {
              title: "Hover and compare",
              body: "Move across days before a move you remember — check whether walls thickened, glow shifted, or max pain pulled price.",
            },
          ]}
        />
      </LearnSection>

      <FnoNinjaLearnVerifyChecklist
        title="Verify it yourself on History"
        steps={[
          {
            title: "Pick one index and one recent week",
            body: "Open History on Bank Nifty or NIFTY with the 1M filter. Find a week where you remember a clear up or down move.",
          },
          {
            title: "Check max pain vs close",
            body: "Hover days leading into expiry — note how often price traded toward the yellow max-pain line vs blew through walls.",
          },
          {
            title: "Watch thickness before the move",
            body: "On up-days, did the green put wall thicken in the sessions before? On down-days, did the red call wall thicken?",
          },
          {
            title: "Note glow flips",
            body: "When green glow faded and red glow strengthened (or the reverse), did dominance shift before price reacted?",
          },
        ]}
      />

      <LearnSection title="Benefits — why use History?">
        <LearnBulletList
          items={[
            "See structure over time — not just one EOD snapshot on the live chart.",
            "Validate OI momentum (thickness) and dominance (glow) with your own eyes.",
            "Compare indices side by side — Bank Nifty vs NIFTY often diverge on wall behaviour.",
            "Transparent data — every point comes from published NSE F&O bhavcopy; hover shows strikes and OI.",
            "No black box — we show derived observations; you decide what they mean for your process.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Don'ts — common mistakes">
        <LearnBulletList
          items={[
            "Do not treat thickness or glow as automatic buy/sell signals — they describe positioning, not direction with certainty.",
            "Do not skip hover — end labels were removed on purpose; strike and OI detail live in the tooltip.",
            "Do not assume NIFTY patterns copy to Midcap Nifty or Next 50 — open each index separately.",
            "Do not confuse History with Outlook — History is backward in time; Outlook is forward across expiries.",
            "Do not use this as investment advice — informational context only, same as every FNO Ninja guide.",
          ]}
        />
      </LearnSection>

      <LearnSection title="Our goal">
        <LearnLead>
          Help traders make decisions based on <strong className="text-slate-200">data — not emotions</strong>.
          Explore the charts, validate the signals, and let the history speak for itself.
        </LearnLead>
        <p>
          If a pattern does not hold on the index you trade, that is useful too — you have ruled something out
          with evidence instead of a screenshot from social media.
        </p>
      </LearnSection>
    </div>
  );
}
