"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Video,
  Youtube,
} from "lucide-react";
import { FB_NARROW_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";
import {
  WEBINAR_DESCRIPTION,
  WEBINAR_DURATION_MIN,
  WEBINAR_HAS_YOUTUBE,
  WEBINAR_JOIN_URL,
  WEBINAR_LEARN_POINTS,
  WEBINAR_TAGLINE,
  buildWebinarIcs,
  formatWebinarSession,
  getUpcomingWebinarSessions,
  googleCalendarUrl,
} from "@/lib/fnoninja/webinar";

const cardStyle = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.18)",
} as const;

function useCountdown(target: Date) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = Math.max(0, target.getTime() - now);
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

function CountdownCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-black tabular-nums text-white"
        style={{ fontSize: "clamp(1.6rem, 6vw, 2.4rem)", lineHeight: 1 }}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
        {label}
      </span>
    </div>
  );
}

export function FnoNinjaWebinarPage() {
  const sessions = useMemo(() => getUpcomingWebinarSessions(6), []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const session = sessions[selectedIdx] ?? sessions[0];
  const cd = useCountdown(session.start);
  const sessionLabel = useMemo(() => formatWebinarSession(session), [session]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const icsUrlRef = useRef<string | null>(null);

  const icsHref = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (icsUrlRef.current) URL.revokeObjectURL(icsUrlRef.current);
    const blob = new Blob([buildWebinarIcs(session)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    icsUrlRef.current = url;
    return url;
  }, [session]);

  useEffect(() => {
    return () => {
      if (icsUrlRef.current) URL.revokeObjectURL(icsUrlRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setError("Please fill in your name, email and mobile.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/fnoninja/webinar/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          mobile,
          sessionDate: session.istDate,
          source: "fnoninja.com/webinar",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setJoinUrl(typeof data.youtubeWatchUrl === "string" ? data.youtubeWatchUrl : null);
      setStatus("done");
    } catch (err: unknown) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="font-sans antialiased flex flex-col flex-1">
      {/* Hero */}
      <section className={`${FB_NARROW_SHELL} pt-14 sm:pt-20 pb-10 text-center`}>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.14)", border: "1px solid rgba(90,140,220,0.25)" }}
        >
          <Video className="h-3.5 w-3.5" />
          Free live webinar · {WEBINAR_DURATION_MIN} min
        </span>
        <h1 className="mt-5 text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.08]">
          FNO <span style={{ color: FNO_ACCENT }}>NINJA</span> Free Webinar
          <br />
          <span style={{ color: FNO_ACCENT }}>Reading option walls &amp; key levels</span>
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          {WEBINAR_TAGLINE} No experience needed — just bring your questions.
        </p>
      </section>

      {/* Session picker + countdown */}
      <section className={`${FB_NARROW_SHELL} pb-8`}>
        <div className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
          {/* Pick a session */}
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-center" style={{ color: FNO_ACCENT }}>
            Pick a session
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {sessions.map((s, i) => {
              const active = i === selectedIdx;
              return (
                <button
                  key={s.istDate + s.start.getTime()}
                  type="button"
                  onClick={() => {
                    setSelectedIdx(i);
                    if (status === "done") setStatus("idle");
                  }}
                  className="rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-all"
                  style={{
                    background: active ? FNO_CTA_GRADIENT : "#0d1525",
                    color: active ? "#fff" : "#cbd5f5",
                    border: active
                      ? "1px solid transparent"
                      : "1px solid rgba(90,140,220,0.2)",
                    boxShadow: active ? FNO_CTA_SHADOW : undefined,
                  }}
                >
                  {formatWebinarSession(s)}
                </button>
              );
            })}
          </div>

          <div
            className="mt-6 pt-6 flex items-center justify-center gap-2 text-sm font-semibold"
            style={{ color: "#93c5fd", borderTop: `1px solid ${FNO_NAV_BORDER}` }}
          >
            <Clock className="h-4 w-4" />
            Starts in · {sessionLabel}
          </div>
          <div className="mt-5 flex items-start justify-center gap-4 sm:gap-7">
            <CountdownCell value={cd.days} label="Days" />
            <CountdownCell value={cd.hours} label="Hrs" />
            <CountdownCell value={cd.minutes} label="Min" />
            <CountdownCell value={cd.seconds} label="Sec" />
          </div>
        </div>
      </section>

      {/* Two-column: learn + register */}
      <section className={`${FB_NARROW_SHELL} pb-16 grid md:grid-cols-2 gap-6`}>
        {/* What you'll learn */}
        <div className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: FNO_ACCENT }}>
            What you&apos;ll learn
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed" style={{ color: "#cbd5f5" }}>
            {WEBINAR_LEARN_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: FNO_ACCENT }} />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed" style={{ color: "#475569" }}>
            {WEBINAR_DESCRIPTION}
          </p>
        </div>

        {/* Register */}
        <div className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
          {status === "done" ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 text-white">
                <CheckCircle2 className="h-5 w-5" style={{ color: "#34d399" }} />
                <span className="text-lg font-black">You&apos;re registered!</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
                Your seat for <span className="text-white font-semibold">{sessionLabel}</span> is saved.
                Add it to your calendar so you don&apos;t miss it.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={googleCalendarUrl(session)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
                  style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Add to Google Calendar
                </a>
                {icsHref && (
                  <a
                    href={icsHref}
                    download="fnoninja-webinar.ics"
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                    style={{ border: "1px solid rgba(90,140,220,0.3)", color: "#93c5fd" }}
                  >
                    <Download className="h-4 w-4" />
                    Download invite (.ics)
                  </a>
                )}
                {(joinUrl || WEBINAR_HAS_YOUTUBE) && (
                  <a
                    href={joinUrl ?? WEBINAR_JOIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                    style={{ border: "1px solid rgba(90,140,220,0.3)", color: "#93c5fd" }}
                  >
                    <Youtube className="h-4 w-4" />
                    Set reminder on YouTube
                  </a>
                )}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#475569" }}>
                We&apos;ll go live on YouTube. We&apos;ve emailed you a calendar invite{joinUrl || WEBINAR_HAS_YOUTUBE ? " — tap “Set reminder” on YouTube too" : ""} so you don&apos;t miss it.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: FNO_ACCENT }}>
                Reserve your free seat
              </p>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={{ backgroundColor: "#0d1525", border: "1px solid rgba(90,140,220,0.2)" }}
                autoComplete="name"
              />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={{ backgroundColor: "#0d1525", border: "1px solid rgba(90,140,220,0.2)" }}
                autoComplete="email"
              />
              <input
                type="tel"
                placeholder="Mobile number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={{ backgroundColor: "#0d1525", border: "1px solid rgba(90,140,220,0.2)" }}
                autoComplete="tel"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={status === "loading"}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reserving…
                  </>
                ) : (
                  "Reserve my free seat"
                )}
              </button>
              <p className="text-[11px] leading-relaxed" style={{ color: "#475569" }}>
                We&apos;ll only use your details to send webinar reminders. No spam.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
        <div className={`${FB_NARROW_SHELL} text-center`}>
          <p className="text-[11px] leading-relaxed max-w-xl mx-auto" style={{ color: "#475569" }}>
            This webinar is educational and informational only. It is not investment advice and does
            not guarantee any outcome or returns. F&amp;O trading carries significant risk.
          </p>
        </div>
      </section>
    </div>
  );
}
