"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Reveal, Stagger, StaggerItem } from "@/components/fnoninja/landing-motion";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { fnoLearnHref } from "@/lib/fnoninja/paths";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const FAQS = [
  {
    q: "What is a put cluster?",
    a: "A strike below the current price where a large number of Put options are open. Heavy put open interest often acts like a floor — we show it as a support zone on the map and charts.",
  },
  {
    q: "What is a call cluster?",
    a: "A strike above the current price where a large number of Call options are open. Heavy call open interest often acts like a ceiling — we show it as a resistance zone.",
  },
  {
    q: "What is max pain?",
    a: "The strike where option writers as a group would lose the least if the underlying finished there at expiry. Near expiry, price sometimes drifts toward it. Useful context — not a prediction.",
  },
] as const;

export function FnoNinjaHeroFaqSection() {
  const pathname = usePathname();
  const methodologyHref = fnoLearnHref(pathname, "methodology");

  return (
    <section id="faq" className="relative border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}>
        <Reveal className="max-w-2xl">
          <SectionEyebrow>Quick FAQ</SectionEyebrow>
          <h2 className="mt-4 text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
            Three terms. <GradientText>Plain English.</GradientText>
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base leading-relaxed text-slate-400">
            The same ideas behind the examples above — so you can read the map without jargon.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:gap-5">
          {FAQS.map(({ q, a }) => (
            <StaggerItem key={q}>
              <div
                className="rounded-2xl border bg-[#0d1830] p-5 sm:p-6"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{q}</h3>
                <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-slate-400">{a}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-8">
          <p className="text-sm text-slate-500">
            Want the full walkthrough?{" "}
            <Link
              href={methodologyHref}
              onClick={() =>
                trackCtaClick("landing_faq_methodology", {
                  label: "How levels are built",
                  href: methodologyHref,
                })
              }
              className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2"
            >
              How levels are built
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
