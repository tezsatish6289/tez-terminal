"use client";

import { FnoNinjaLoginLink } from "@/components/fnoninja/FnoNinjaLoginPage";
import {
  fadeLeft,
  fadeScale,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/fnoninja/landing-motion";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_LANDING_ATLAS_HINT } from "@/lib/fnoninja/login-copy";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const ATLAS_FEATURES = [
  { title: "Ask anything", body: "Symbols, levels, setups" },
  { title: "Grounded", body: "Live FNO Ninja data" },
  { title: "Plain English", body: "No jargon walls" },
  { title: "Always on", body: "24/7 standby" },
] as const;

export function FnoNinjaAtlasSection() {
  return (
    <section id="atlas-ai" className="relative overflow-hidden border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 58% at 70% 35%, rgba(99,102,241,0.1), transparent 65%), radial-gradient(48% 42% at 25% 55%, rgba(99,102,241,0.05), transparent 58%)",
        }}
      />
      <div className={`${FNO_LANDING_SHELL} relative py-16 sm:py-20 lg:py-24`}>
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <Reveal variants={fadeLeft} className="flex flex-col justify-center">
            <div className="mb-6 flex items-center gap-3">
              <SectionEyebrow>ATLAS AI</SectionEyebrow>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#60a5fa]">
                Included in every plan
              </span>
            </div>

            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.8rem] lg:leading-[1.08] text-white">
              Ask about any symbol. <GradientText>Get grounded answers.</GradientText>
            </h2>

            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-slate-400">
              An F&amp;O research assistant built on the same live option-chain data you see on the
              market map.
            </p>

            <Stagger className="mt-8 grid max-w-md grid-cols-2 gap-3">
              {ATLAS_FEATURES.map((item) => (
                <StaggerItem
                  key={item.title}
                  className="rounded-xl border border-[rgba(90,140,220,0.16)] bg-[#0d1830]/40 p-4"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#60a5fa]">
                    {item.title}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-snug text-slate-300">{item.body}</div>
                </StaggerItem>
              ))}
            </Stagger>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <FnoNinjaLoginLink
                className={LANDING_PRIMARY_CTA}
                src="landing"
                cta="chat_with_atlas"
                onClick={() => trackCtaClick("atlas_chat", { label: "Chat with ATLAS" })}
              >
                Chat with ATLAS
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </FnoNinjaLoginLink>
              <span className="text-xs text-slate-500">{FNO_LANDING_ATLAS_HINT}</span>
            </div>
          </Reveal>

          <Reveal variants={fadeScale} className="relative">
            <div
              className="overflow-hidden rounded-2xl border bg-[#0d1830]/70 shadow-2xl backdrop-blur"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.45)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#3b82f6]/20 text-[14px] font-black text-[#93c5fd] ring-1 ring-[#3b82f6]/30">
                    AI
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">ATLAS</p>
                    <p className="text-[11px] text-slate-500">F&amp;O research assistant</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Live
                </span>
              </div>

              <div className="space-y-4 px-5 py-6 text-[13px]">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-slate-300">
                  Key levels for NIFTY?
                </div>

                <div className="ml-auto max-w-[92%]">
                  <div className="rounded-2xl rounded-tr-sm border border-[#3b82f6]/20 bg-[#3b82f6]/10 px-3.5 py-2.5 text-white">
                    Put Cluster at <span className="font-semibold text-[#60a5fa]">24,000</span> and Call
                    Cluster at <span className="font-semibold text-[#60a5fa]">24,400</span>. Heavy OI
                    means price often reacts around these zones.
                  </div>
                  <p className="mt-1.5 pr-1 text-[10px] text-slate-500">Answered in 0.4s</p>
                </div>
              </div>

              <div
                className="border-t px-5 py-3"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.45)" }}
              >
                <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}>
                  <span className="text-slate-600">›</span>
                  <span className="flex-1 truncate text-[13px] text-slate-500">Ask ATLAS anything...</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#3b82f6] text-white">↑</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
