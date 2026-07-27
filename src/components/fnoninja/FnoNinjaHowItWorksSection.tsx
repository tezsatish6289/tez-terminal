"use client";

import {
  Reveal,
  RevealLine,
  Stagger,
  StaggerItem,
} from "@/components/fnoninja/landing-motion";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const STEPS = [
  {
    step: "01",
    title: "Scan",
    body: "Option-chain data across 200+ NSE F&O symbols, all session long.",
  },
  {
    step: "02",
    title: "Highlight",
    body: "Put clusters, call clusters, and max pain surfaced instantly.",
  },
  {
    step: "03",
    title: "Focus",
    body: "You see what matters without scanning hundreds of chains.",
  },
] as const;

export function FnoNinjaHowItWorksSection() {
  return (
    <section id="how" className="relative border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}>
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
              See the structure. <GradientText>Skip the scanning.</GradientText>
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-slate-400">
            Three steps. Raw OI in, clear context out.
          </p>
        </Reveal>

        <div className="relative mt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute left-8 right-8 top-6 hidden h-px overflow-hidden bg-white/10 sm:block"
          >
            <RevealLine className="h-full w-full bg-gradient-to-r from-[#3b82f6]/20 via-[#60a5fa] to-[#3b82f6]/20" />
          </div>

          <Stagger className="relative grid gap-4 sm:grid-cols-3 lg:gap-5">
            {STEPS.map(({ step, title, body }) => (
              <StaggerItem key={step}>
                <div
                  className="group relative rounded-2xl border bg-[#0d1830] p-6 transition hover:-translate-y-1 hover:border-[#3b82f6]/50"
                  style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}
                >
                  <p className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#3b82f6]/30 bg-[#080f1e] text-sm font-black tracking-wider text-[#60a5fa]">
                    {step}
                  </p>
                  <h3 className="mt-5 text-lg sm:text-xl lg:text-2xl font-bold text-white leading-snug">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-400">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
