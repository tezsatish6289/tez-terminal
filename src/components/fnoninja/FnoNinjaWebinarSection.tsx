import Link from "next/link";
import { ArrowRight, CalendarClock, Video } from "lucide-react";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";
import { WEBINAR_LEARN_POINTS, WEBINAR_PATH } from "@/lib/fnoninja/webinar";

export function FnoNinjaWebinarSection() {
  return (
    <section
      id="webinar"
      className={`${FB_CONTENT_SHELL} py-16 sm:py-20`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div
        className="rounded-3xl p-8 sm:p-12 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center"
        style={{
          backgroundColor: "#0f1729",
          border: "1px solid rgba(96,165,250,0.25)",
          boxShadow: "0 0 0 1px rgba(96,165,250,0.06), 0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.16)", border: "1px solid rgba(90,140,220,0.25)" }}
          >
            <Video className="h-3.5 w-3.5" />
            Free live webinar · 1 hr
          </span>
          <h2 className="mt-5 text-2xl sm:text-4xl font-black text-white tracking-tight leading-[1.1]">
            Join our free webinar{" "}
            <span style={{ color: FNO_ACCENT }}>(1 hr)</span>
          </h2>
          <p className="mt-4 max-w-md text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
            Learn to read option walls, support &amp; resistance, and max-pain — and how to plan
            trades around them with FNONINJA. Live every evening at 8 PM IST.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={WEBINAR_PATH}
              className="inline-flex items-center gap-2.5 rounded-lg px-7 py-3.5 text-xs uppercase tracking-widest font-bold text-white transition-all hover:scale-105"
              style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
            >
              Reserve your free seat
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
              <CalendarClock className="h-3.5 w-3.5" />
              Daily · 8:00 PM IST
            </span>
          </div>
        </div>

        <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "#cbd5f5" }}>
          {WEBINAR_LEARN_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: FNO_ACCENT }}
              />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-5 text-center text-[11px] leading-relaxed max-w-lg mx-auto" style={{ color: "#475569" }}>
        Educational session · not investment advice.
      </p>
    </section>
  );
}
