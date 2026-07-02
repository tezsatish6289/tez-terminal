import Link from "next/link";
import { ArrowRight, CalendarClock, Users, Video } from "lucide-react";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";
import { WEBINAR_LEARN_POINTS, WEBINAR_PATH, WEBINAR_SCHEDULE_LABEL } from "@/lib/fnoninja/webinar";

type FnoNinjaWebinarCardProps = {
  /** Single-column layout when the card sits in a narrow column beside Atlas. */
  compact?: boolean;
  className?: string;
  /** Total registrations across all webinar sessions. */
  registrationCount?: number;
};

function formatRegistrationCount(count: number): string {
  return count.toLocaleString("en-IN");
}

export function FnoNinjaWebinarCard({
  compact = false,
  className = "",
  registrationCount,
}: FnoNinjaWebinarCardProps) {
  return (
    <div
      id="webinar"
      className={`rounded-3xl p-6 sm:p-8 h-full flex flex-col ${
        compact ? "gap-6" : "grid lg:grid-cols-2 gap-8 lg:gap-12 items-center"
      } ${className}`}
      style={{
        backgroundColor: "#0f1729",
        border: "1px solid rgba(96,165,250,0.25)",
        boxShadow: "0 0 0 1px rgba(96,165,250,0.06), 0 24px 60px rgba(0,0,0,0.35)",
      }}
    >
      <div>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
          style={{
            color: "#93c5fd",
            backgroundColor: "rgba(37,99,235,0.16)",
            border: "1px solid rgba(90,140,220,0.25)",
          }}
        >
          <Video className="h-3.5 w-3.5" />
          Free live webinar · 1 hr
        </span>
        <h2
          className={`mt-4 font-black text-white tracking-tight leading-[1.1] ${
            compact ? "text-xl sm:text-2xl" : "mt-5 text-2xl sm:text-4xl"
          }`}
        >
          Join our free webinar (1 hr)
        </h2>
        <p
          className={`mt-3 leading-relaxed ${compact ? "text-sm" : "mt-4 max-w-md text-sm sm:text-base"}`}
          style={{ color: FNO_MUTED }}
        >
          Learn to read option walls, support &amp; resistance, and max-pain — and how to plan trades
          around them with FNONINJA.
        </p>
        {registrationCount != null && registrationCount > 0 ? (
          <p
            className={`inline-flex items-center gap-1.5 font-semibold text-white/90 ${
              compact ? "mt-4 text-sm" : "mt-4 text-sm sm:text-base"
            }`}
          >
            <Users className="h-4 w-4 shrink-0" style={{ color: FNO_ACCENT }} aria-hidden />
            {formatRegistrationCount(registrationCount)} people registered
          </p>
        ) : null}
        <div className={`flex flex-wrap items-center gap-3 ${compact ? "mt-5" : "mt-7"}`}>
          <Link
            href={WEBINAR_PATH}
            className="inline-flex items-center gap-2.5 rounded-lg px-5 py-3 text-xs uppercase tracking-widest font-bold text-white transition-all hover:scale-105 sm:px-7 sm:py-3.5"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Reserve your free seat
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs" style={{ color: "#64748b" }}>
            <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
            {WEBINAR_SCHEDULE_LABEL}
          </span>
        </div>
      </div>

      <ul className="space-y-2.5 text-sm leading-relaxed" style={{ color: "#cbd5f5" }}>
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
  );
}

export function FnoNinjaWebinarSection() {
  return (
    <section
      className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <FnoNinjaWebinarCard />
      <p
        className="mt-5 text-center text-[11px] leading-relaxed max-w-lg mx-auto"
        style={{ color: "#475569" }}
      >
        Educational session · not investment advice.
      </p>
    </section>
  );
}
