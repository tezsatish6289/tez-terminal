"use client";

import { FnoNinjaAtlasLiveVisual } from "@/components/fnoninja/learn/FnoNinjaAtlasLiveVisual";
import { AtlasLearnMenuMock } from "@/components/fnoninja/learn/AtlasLearnMenuMock";
import {
  LearnBulletList,
  LearnLead,
  LearnSection,
  LearnSteps,
  LearnTerm,
} from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { useLearnNiftyLiveData } from "@/lib/fnoninja/use-learn-nifty-live-data";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export function FnoNinjaAtlasScrollGuide() {
  const { levels, candles, loading, candlesLoading } = useLearnNiftyLiveData();

  return (
    <div className="space-y-8">
      <LearnSection title="What is Atlas AI coach? (in plain English)">
        <LearnLead>
          <strong className="text-slate-200">Atlas</strong> is an on-chart research assistant. It reads the
          same zones, OI walls, and volatility context you see on FNO Ninja, then helps you explore{" "}
          <strong className="text-slate-200">hedged, defined-risk</strong> scenarios — or answers plain
          questions about the data.
        </LearnLead>
        <p>
          It does <strong className="text-slate-200">not</strong> run in the background. Nothing is generated
          until you open Atlas and pick one of three requests. That keeps it educational, on-demand, and clear
          that you are asking for analysis — not receiving a push alert.
        </p>
      </LearnSection>

      <LearnSection title="Where to find Atlas">
        <LearnSteps
          steps={[
            {
              title: "Open any symbol chart",
              body: "Indices (NIFTY, Bank Nifty, etc.) and NSE stocks — from the market map or a direct chart link.",
            },
            {
              title: "Tap Atlas AI coach",
              body: "The sparkle button sits on the chart header. It opens a side panel tied to that symbol's live levels.",
            },
            {
              title: "Pick what you want",
              body: "Options strategy, futures strategy, or FAQ-only — Atlas only works on the path you choose.",
            },
          ]}
        />
      </LearnSection>

      <LearnSection title="The three requests (what each one does)">
        <LearnTerm term="Build an option strategy">
          Atlas proposes <strong className="text-slate-200">hedged option structures</strong> — spreads and
          similar defined-risk setups — grounded in today&apos;s support, resistance, OI walls, and IV regime.
          Max risk and reward are shown up front (estimated from ATM IV).
        </LearnTerm>
        <LearnTerm term="Build a futures strategy">
          A <strong className="text-slate-200">futures directional view</strong> paired with a protective
          option leg so worst-case loss is capped. Same data inputs; different instrument mix.
        </LearnTerm>
        <LearnTerm term="I have a different question">
          Static explainers only — max pain, OI walls, IV regime, how risk numbers are calculated, and the
          disclaimer. <strong className="text-slate-200">No AI call, no strategy generated.</strong> Free
          to browse anytime.
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
          Chart + Atlas layout on real data
        </h2>
        <p className="text-sm sm:text-[15px] leading-relaxed mb-5" style={{ color: "#cbd5e1" }}>
          Below is a <strong className="text-slate-200">live NIFTY chart</strong> with today&apos;s zones.
          Beside it: the same request menu you see in the app, plus an{" "}
          <strong className="text-slate-200">example output layout</strong> filled with live key levels.
          We deliberately <strong className="text-slate-200">do not embed a live-generated strategy</strong>{" "}
          in this guide — open Atlas on the chart for today&apos;s hedged legs and economics.
        </p>
        <FnoNinjaAtlasLiveVisual
          levels={levels}
          loading={loading}
          candles={candles}
          candlesLoading={candlesLoading}
        />
      </section>

      <LearnSection title="Why we skip live strategies in this guide">
        <LearnBulletList
          items={[
            "Strategies go stale within minutes — a blog embed would mislead more than it helps.",
            "Atlas is on-demand: you choose when to spend the model call, on the symbol you are actually viewing.",
            "Regulatory clarity — this page teaches the tool; the chart is where scenarios are generated for you.",
            "Live key levels (support, walls, max pain) are enough to show how Atlas grounds its output.",
          ]}
        />
        <p className="mt-4">
          On the chart, Atlas shows bias, rationale, key levels, structure legs, max risk/reward, break-evens,
          and watch-outs — all labeled as educational scenarios, not advice.
        </p>
      </LearnSection>

      <LearnSection title="Benefits — why use Atlas?">
        <LearnBulletList
          items={[
            "Turns raw zones and OI walls into structured scenarios you can compare.",
            "Every idea is hedged — no naked unlimited-risk positions.",
            "FAQ path teaches max pain, walls, and IV without triggering strategy generation.",
            "Same symbol context as your chart — no copy-pasting strikes from elsewhere.",
            "Refresh anytime after a new data scan if levels shift.",
          ]}
        />
      </LearnSection>

      <LearnSection title="To dos — how to use Atlas well">
        <LearnBulletList
          items={[
            "Read the zones on the chart first — Atlas extends what you already see, it does not replace it.",
            "Start with FAQ if terms like max pain or IV regime are new.",
            "Compare option vs futures mode only after you understand the bias headline.",
            "Treat economics as estimates (Black-Scholes from ATM IV), not broker quotes.",
            "Use invalidation levels as a sanity check — if price breaks there, the scenario is wrong.",
            "Never treat Atlas output as a trade recommendation; it is research scaffolding.",
          ]}
        />
      </LearnSection>

      <LearnSection title="What Atlas does not do">
        <LearnBulletList
          items={[
            "Predict where price will go tomorrow or at expiry.",
            "Know your account size, margin, or risk tolerance.",
            "Replace a registered investment adviser or your own due diligence.",
            "Run automatically — you must open it and pick a request.",
          ]}
        />
      </LearnSection>

      <section
        className="rounded-2xl p-6 sm:p-8"
        style={{ backgroundColor: "rgba(8,15,30,0.45)", border: "1px solid rgba(96,165,250,0.18)" }}
      >
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Request menu (reference)</h2>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
          This is the screen you land on when Atlas opens — three cards, one choice:
        </p>
        <div className="max-w-md mx-auto">
          <AtlasLearnMenuMock symbol="NIFTY" symbolLabel="Nifty 50" />
        </div>
      </section>
    </div>
  );
}
