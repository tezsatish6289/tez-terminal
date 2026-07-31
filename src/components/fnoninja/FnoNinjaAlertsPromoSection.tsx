"use client";

import { Bell, Percent } from "lucide-react";
import { FnoNinjaLoginLink } from "@/components/fnoninja/FnoNinjaLoginPage";
import { Reveal, Stagger, StaggerItem } from "@/components/fnoninja/landing-motion";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const CARDS = [
  {
    icon: Percent,
    eyebrow: "On every chart",
    title: "Atlas ↑ / ↓ probabilities",
    body: "See calibrated upside and downside probabilities next to the Atlas score — grounded in historical zone outcomes, not guesswork.",
    tags: ["Trial", "Silver", "Gold"],
  },
  {
    icon: Bell,
    eyebrow: "Hands-free watch",
    title: "Score alerts",
    body: "Get pinged when a setup crosses your Atlas floor. Trial and Silver use ≥60 / ≥70. Gold unlocks ≥80 for the sharpest conviction filter.",
    tags: ["≥60 / ≥70 all plans", "≥80 Gold"],
  },
] as const;

export function FnoNinjaAlertsPromoSection() {
  return (
    <section
      id="alerts"
      className={`${FNO_LANDING_SHELL} relative overflow-hidden border-b py-16 sm:py-20 lg:py-24`}
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] opacity-50"
        style={{
          background:
            "radial-gradient(45% 55% at 30% 0%, rgba(59,130,246,0.12), transparent 70%), radial-gradient(40% 50% at 80% 20%, rgba(251,191,36,0.08), transparent 65%)",
        }}
      />

      <Reveal className="relative mb-10 sm:mb-12 max-w-2xl">
        <SectionEyebrow>Decision aids</SectionEyebrow>
        <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Probabilities on the chart. <GradientText>Alerts when it matters.</GradientText>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-400">
          Stop staring at 200 names. Use calibrated probabilities to judge a setup, then let score
          alerts bring the next one to you.
        </p>
      </Reveal>

      <Stagger className="relative grid gap-4 md:grid-cols-2">
        {CARDS.map(({ icon: Icon, eyebrow, title, body, tags }) => (
          <StaggerItem key={title}>
            <article
              className="h-full rounded-2xl border p-6 sm:p-7 transition hover:-translate-y-1 hover:border-[#60a5fa]/30"
              style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3b82f6]/15 text-[#60a5fa]">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-[#60a5fa]">
                {eyebrow}
              </p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-white">{title}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-400">{body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2.5 py-1 text-[11px] text-slate-400"
                    style={{
                      borderColor: "rgba(90,140,220,0.14)",
                      backgroundColor: "rgba(148,163,184,0.05)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="relative mt-10">
        <FnoNinjaLoginLink
          className={LANDING_PRIMARY_CTA}
          src="landing"
          cta="alerts_promo"
          onClick={() => trackCtaClick("alerts_promo_cta", { label: "Try alerts free" })}
        >
          Try alerts free
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </FnoNinjaLoginLink>
      </Reveal>
    </section>
  );
}
