"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { fnoWebinarHref } from "@/lib/fnoninja/paths";
import {
  WEBINAR_LEARN_POINTS,
  WEBINAR_PATH,
} from "@/lib/fnoninja/webinar";
import {
  FNO_LANDING_BORDER,
  LANDING_PRIMARY_CTA,
  LANDING_PRIMARY_CTA_SM,
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
        className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-[#0d1830]/45 p-8 lg:p-12"
        style={{ boxShadow: "0 0 60px -24px rgba(251,191,36,0.12)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 opacity-50"
          style={{
            background: "radial-gradient(closest-side, rgba(251,191,36,0.11), transparent 70%)",
          }}
        />
        <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Free live webinar · this week
        </div>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <SectionEyebrow>Webinar teaser</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-[1.05] text-white">
              Don&apos;t miss the next live session
            </h2>
            <p className="mt-4 max-w-lg text-[15px] text-slate-400">
              One hour. Free. Learn to read option walls and plan trades around them.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { k: "Mon & Wed", v: "9:00 PM IST" },
                { k: "Sunday", v: "11:00 AM IST" },
                { k: "Duration", v: "1 hr + Q&A" },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-[rgba(90,140,220,0.18)] bg-[#0a1220]/40 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{s.k}</div>
                  <div className="mt-0.5 text-sm font-bold text-white">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={webinarHref} className={LANDING_PRIMARY_CTA}>
                See the full webinar page
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href={webinarHref} className={LANDING_PRIMARY_CTA_SM}>
                Reserve your seat
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-slate-400">
              {registered === null
                ? "Loading registrations..."
                : `${registered.toLocaleString("en-IN")}+ registered`}
            </p>
          </div>
          <ul className="space-y-3">
            {WEBINAR_LEARN_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.4)" }}
              >
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#3b82f6]/20 text-[11px] text-[#93c5fd]">
                  ✓
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
