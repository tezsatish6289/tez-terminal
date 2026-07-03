"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { fnoWebinarHref } from "@/lib/fnoninja/paths";
import {
  WEBINAR_LEARN_POINTS,
  WEBINAR_PATH,
  WEBINAR_SCHEDULE_LABEL,
} from "@/lib/fnoninja/webinar";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  LANDING_SHIMMER,
  SectionEyebrow,
  useWebinarStats,
} from "@/lib/fnoninja/landing-ui";

const FALLBACK_WEBINAR_HREF = "/fnoninja/webinar";

export function FnoNinjaWebinarLandingSection() {
  const pathname = usePathname();
  const registered = useWebinarStats();
  const webinarHref = fnoWebinarHref(pathname) || WEBINAR_PATH || FALLBACK_WEBINAR_HREF;

  return (
    <section className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div
        className="rounded-2xl border bg-gradient-to-br from-[#0d1830] via-[#101d3a] to-[#0a1a3a] p-8 lg:p-12"
        style={{ borderColor: FNO_LANDING_BORDER }}
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionEyebrow>Free live webinar · 1 hr</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl text-white">
              Join our <GradientText>free webinar</GradientText>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] text-slate-400">
              Learn to read option walls, support &amp; resistance, and max-pain - and how to plan
              trades around them with FNO Ninja.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={webinarHref} className={LANDING_PRIMARY_CTA}>
                <span className={LANDING_SHIMMER} />
                See the full webinar page
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <span className="text-xs text-slate-500">{WEBINAR_SCHEDULE_LABEL}</span>
            </div>
            <p className="mt-4 text-[12px] text-slate-400">
              {registered === null
                ? "Loading registrations..."
                : `${registered.toLocaleString("en-IN")} people registered`}
            </p>
          </div>
          <ul className="space-y-3">
            {WEBINAR_LEARN_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.4)" }}
              >
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#3b82f6]/25 text-[11px] text-[#60a5fa]">
                  →
                </span>
                <span className="text-white">{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-xs text-slate-500">Educational session · not investment advice.</p>
      </div>
    </section>
  );
}
