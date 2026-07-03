"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  LineChart,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  LANDING_SHIMMER,
  useWebinarStats,
} from "@/lib/fnoninja/landing-ui";
import {
  formatWebinarSession,
  getUpcomingWebinarSessions,
  WEBINAR_DURATION_MIN,
  WEBINAR_SCHEDULE_LABEL,
} from "@/lib/fnoninja/webinar";
import { FnoNinjaWebinarRegisterModal } from "./FnoNinjaWebinarRegisterModal";

function WebinarEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border bg-[#0d1830]/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#60a5fa]"
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#60a5fa]" />
      {children}
    </div>
  );
}

const AGENDA = [
  {
    icon: LineChart,
    title: "Read option-chain zones",
    body: "Spot support and resistance from OI concentrations — not from lines drawn by feel.",
  },
  {
    icon: Target,
    title: "Decode max-pain & OI walls",
    body: "What large positioning actually reveals about where the market wants to settle.",
  },
  {
    icon: Sparkles,
    title: "Build a rule-based plan",
    body: "Turn the read into entry, stop, and exit rules you can repeat without guessing.",
  },
  {
    icon: PlayCircle,
    title: "Use the FNO Ninja live map",
    body: "Walk through the workflow professional traders run every morning in under 5 minutes.",
  },
  {
    icon: Users,
    title: "Live Q&A",
    body: "Bring your charts. Get direct answers on your setups from the host.",
  },
] as const;

const FOR_WHO = [
  {
    tag: "Beginner",
    title: "New to options",
    body: "Skip the theory rabbit hole. Learn what actually moves price and how to read it fast.",
  },
  {
    tag: "Intermediate",
    title: "Trades but guesses",
    body: "Replace hunches with a repeatable process built on positioning data.",
  },
  {
    tag: "Advanced",
    title: "Wants an edge",
    body: "Layer smart-money reads on top of your existing system without rewriting it.",
  },
] as const;

const TESTIMONIALS = [
  {
    q: "First time I actually understood why price stops where it does. The OI-walls concept alone changed how I look at intraday.",
    a: "Rahul K.",
    r: "Swing trader, Mumbai",
  },
  {
    q: "No selling, no hype. Just a clean framework. I'd pay for this — genuinely surprised it's free.",
    a: "Priya S.",
    r: "Options trader, Bengaluru",
  },
  {
    q: "The live Q&A is the differentiator. Got my exact setup reviewed and left with a real plan.",
    a: "Arjun M.",
    r: "Full-time trader, Pune",
  },
] as const;

const FAQS = [
  {
    q: "Is it really free?",
    a: "Yes. No credit card, no upsell mid-session. If FNO Ninja is right for you afterwards, you can decide on your own time.",
  },
  {
    q: "Do I need prior options experience?",
    a: "No. We start from what the option chain actually shows and build up. Intermediate traders will still get new angles on positioning.",
  },
  {
    q: "Will the session be recorded?",
    a: "The workshop is live-first. Registered attendees who miss it get a short summary; the full experience is the live Q&A.",
  },
  {
    q: "What do I need to attend?",
    a: "Just a laptop or phone with a browser. We'll share the join link by email after you register.",
  },
  {
    q: "How long is it?",
    a: "60 minutes of teaching plus 10–15 minutes of live Q&A. Stay for the Q&A — it's the best part.",
  },
] as const;

const SLOT_NOTES: Record<number, string> = {
  1: "Weekly kickoff · positioning outlook",
  3: "Mid-week review · live setups",
  0: "Deep-dive · framework & Q&A",
};

function WebinarHero({
  onReserve,
  count,
}: {
  onReserve: () => void;
  count: number | null;
}) {
  const nextSession = useMemo(() => getUpcomingWebinarSessions(1)[0], []);

  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-[520px] w-[520px] rounded-full bg-[#3b82f6]/20 blur-[140px]" />
        <div className="absolute right-0 top-40 h-[420px] w-[420px] rounded-full bg-[#6366f1]/15 blur-[140px]" />
      </div>

      <div
        className={`${FNO_LANDING_SHELL} grid gap-14 py-16 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-24`}
      >
        <div>
          <WebinarEyebrow>Free live workshop · {WEBINAR_DURATION_MIN} min</WebinarEyebrow>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Read the option chain like an <GradientText>analyst — not a rumour.</GradientText>
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-slate-400">
            A no-fluff, 60-minute live workshop on how professionals interpret support, resistance,
            max-pain, and open-interest walls — then turn that read into a rule-based trading plan.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button type="button" onClick={onReserve} className={LANDING_PRIMARY_CTA}>
              <span className={LANDING_SHIMMER} />
              Reserve your free seat
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarClock className="h-4 w-4 text-[#60a5fa]" />
              {WEBINAR_SCHEDULE_LABEL}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-[12px] text-slate-400">
            <div className="inline-flex items-center gap-2">
              <div className="flex -space-x-2">
                {["A", "R", "P", "S"].map((x) => (
                  <div
                    key={x}
                    className="grid h-6 w-6 place-items-center rounded-full border border-[#0a1220] bg-[#3b82f6] text-[10px] font-bold text-white"
                  >
                    {x}
                  </div>
                ))}
              </div>
              <span className="text-white/70">
                {count === null
                  ? "Loading registrations…"
                  : `${count.toLocaleString("en-IN")} traders registered`}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              100% free · No credit card
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-[#3b82f6]/30 via-transparent to-[#6366f1]/25 blur-2xl" />
          <div
            className="overflow-hidden rounded-2xl border bg-gradient-to-br from-[#131a28] via-[#0d1830] to-[#0a1220] p-1 shadow-2xl"
            style={{ borderColor: FNO_LANDING_BORDER }}
          >
            <div className="rounded-[15px] bg-[#0a1220]/70 p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> Live
                </span>
                <span className="text-[11px] text-slate-400">
                  Next: {nextSession ? formatWebinarSession(nextSession) : "Soon"}
                </span>
              </div>

              <div
                className="mt-5 aspect-video overflow-hidden rounded-xl border bg-[#0a1220]/50"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.25),transparent_60%)]">
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 backdrop-blur">
                        <PlayCircle className="h-8 w-8 text-white" />
                      </div>
                      <span className="text-[11px] uppercase tracking-widest text-slate-400">
                        Live workshop preview
                      </span>
                    </div>
                  </div>
                  <svg
                    className="absolute inset-0 h-full w-full opacity-40"
                    viewBox="0 0 400 200"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0,150 C60,120 100,160 160,110 S260,60 320,90 400,50 400,50"
                      stroke="#60a5fa"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d="M0,170 C50,150 120,140 180,150 S280,120 400,100"
                      stroke="#818cf8"
                      strokeWidth="1.5"
                      fill="none"
                      strokeDasharray="3 3"
                    />
                  </svg>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                {[
                  { k: "60", l: "minutes" },
                  { k: "3×", l: "per week" },
                  { k: "Q&A", l: "included" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="rounded-lg border bg-[#0d1830]/40 p-3"
                    style={{ borderColor: FNO_LANDING_BORDER }}
                  >
                    <div className="text-lg font-black text-white">{s.k}</div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WebinarLearn() {
  return (
    <section className="border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}>
        <div className="max-w-2xl">
          <WebinarEyebrow>What you&apos;ll learn</WebinarEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-[2.4rem] sm:leading-[1.1]">
            A working framework — not another indicator dump.
          </h2>
          <p className="mt-4 text-[15px] text-slate-400">
            Five focused blocks. Every idea is demonstrated on real chart examples you can revisit the
            next morning.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AGENDA.map((a, i) => {
            const Icon = a.icon;
            return (
              <div
                key={a.title}
                className="group relative overflow-hidden rounded-xl border bg-[#0d1830]/40 p-6 transition hover:border-[#60a5fa]/40 hover:bg-[#0d1830]/60"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                <div className="absolute right-4 top-4 text-[11px] font-bold text-slate-500/60">
                  0{i + 1}
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3b82f6]/15 text-[#60a5fa]">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-white">{a.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-400">{a.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WebinarForWho() {
  return (
    <section
      className="border-b bg-[#0d1830]/20"
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <WebinarEyebrow>Who it&apos;s for</WebinarEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Built for traders who want to read the data, not the noise.
            </h2>
          </div>
          <p className="max-w-sm text-[14px] text-slate-400">
            Whether you&apos;re placing your first trade or refining a real system, the framework
            scales with you.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {FOR_WHO.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border bg-[#0a1220]/60 p-6"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              <div className="text-[11px] uppercase tracking-widest text-slate-400">{p.tag}</div>
              <div className="mt-1 text-lg font-bold text-white">{p.title}</div>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-400">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WebinarHost() {
  return (
    <section className="border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}>
        <div
          className="grid gap-10 rounded-2xl border bg-gradient-to-br from-[#0d1830]/60 to-transparent p-8 lg:grid-cols-[280px_1fr] lg:p-12"
          style={{ borderColor: FNO_LANDING_BORDER }}
        >
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#3b82f6]/30 to-[#6366f1]/20 blur-2xl" />
            <div
              className="relative aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border bg-gradient-to-br from-[#131a28] to-[#0d1830]"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              <div className="grid h-full w-full place-items-center text-6xl font-black text-white/80">
                FN
              </div>
            </div>
          </div>
          <div>
            <WebinarEyebrow>Your host</WebinarEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Trained by the FNO Ninja analyst team
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400">
              The same team that builds the analytics used by 5,000+ Indian F&amp;O traders. Every
              session is taught on real market data — never staged screenshots or backtested-only
              setups.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { k: "5,000+", l: "Active users" },
                { k: "200+", l: "Sessions delivered" },
                { k: "4.8 / 5", l: "Attendee rating" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-lg border bg-[#0a1220]/40 p-4"
                  style={{ borderColor: FNO_LANDING_BORDER }}
                >
                  <div className="text-xl font-black text-white">{s.k}</div>
                  <div className="text-[11px] uppercase tracking-widest text-slate-400">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WebinarSchedule({ onReserve }: { onReserve: (sessionDate: string) => void }) {
  const sessions = useMemo(() => {
    const upcoming = getUpcomingWebinarSessions(12);
    const byWeekday = new Map<number, (typeof upcoming)[0]>();
    for (const s of upcoming) {
      const wd = new Date(s.start.getTime() + (5 * 60 + 30) * 60_000).getUTCDay();
      if (!byWeekday.has(wd)) byWeekday.set(wd, s);
    }
    const order = [1, 3, 0];
    return order
      .map((wd) => byWeekday.get(wd))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }, []);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <section
      className="border-b bg-[#0d1830]/20"
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}>
        <div className="max-w-2xl">
          <WebinarEyebrow>Upcoming sessions</WebinarEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Pick a time that fits your week.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {sessions.map((s) => {
            const wd = new Date(s.start.getTime() + (5 * 60 + 30) * 60_000).getUTCDay();
            const day = dayNames[wd];
            const time = formatWebinarSession(s).replace(/^[^·]+·\s*/, "");
            return (
              <div
                key={s.istDate}
                className="group flex flex-col justify-between rounded-xl border bg-[#0a1220]/60 p-6 transition hover:border-[#60a5fa]/40"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#60a5fa]">
                    <Clock className="h-3.5 w-3.5" /> {time}
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-white">{day}</div>
                  <p className="mt-2 text-[13px] text-slate-400">{SLOT_NOTES[wd] ?? ""}</p>
                  <p className="mt-1 text-[11px] text-slate-500/70">{s.istDate}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onReserve(s.istDate)}
                  className="mt-6 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-[#60a5fa] transition group-hover:gap-3"
                >
                  Reserve seat <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WebinarTestimonials() {
  return (
    <section className="border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20`}>
        <div className="max-w-2xl">
          <WebinarEyebrow>What attendees say</WebinarEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            60 minutes people don&apos;t regret spending.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.a}
              className="flex flex-col rounded-xl border bg-[#0d1830]/40 p-6"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              <div className="text-2xl leading-none text-[#60a5fa]">&ldquo;</div>
              <blockquote className="mt-3 text-[14px] leading-relaxed text-white/80">{t.q}</blockquote>
              <figcaption className="mt-6 border-t pt-4" style={{ borderColor: FNO_LANDING_BORDER }}>
                <div className="text-sm font-bold text-white">{t.a}</div>
                <div className="text-[12px] text-slate-400">{t.r}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function WebinarFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      className="border-b bg-[#0d1830]/20"
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <div className={`${FNO_LANDING_SHELL} max-w-3xl py-16 sm:py-20`}>
        <div className="text-center">
          <WebinarEyebrow>FAQ</WebinarEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Quick answers before you sign up.
          </h2>
        </div>
        <div
          className="mt-10 divide-y rounded-xl border bg-[#0a1220]/60"
          style={{ borderColor: FNO_LANDING_BORDER }}
        >
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#0d1830]/40"
                >
                  <span className="text-[15px] font-semibold text-white">{f.q}</span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[#60a5fa] transition ${isOpen ? "rotate-45" : ""}`}
                    style={{ borderColor: FNO_LANDING_BORDER }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-[14px] leading-relaxed text-slate-400">{f.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WebinarFinalCTA({
  onReserve,
  count,
}: {
  onReserve: () => void;
  count: number | null;
}) {
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_60%)]" />
      </div>
      <div className={`${FNO_LANDING_SHELL} max-w-4xl py-20 text-center sm:py-24`}>
        <WebinarEyebrow>Next session fills up</WebinarEyebrow>
        <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
          Spend 60 minutes with us.{" "}
          <GradientText>Read markets differently forever.</GradientText>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] text-slate-400">
          Free · Live · Cameras optional. Come with a question, leave with a framework.
          {count !== null && (
            <>
              {" "}
              <span className="text-white/80">
                Join {count.toLocaleString("en-IN")} traders already registered.
              </span>
            </>
          )}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button type="button" onClick={onReserve} className={LANDING_PRIMARY_CTA}>
            <span className={LANDING_SHIMMER} />
            Reserve your free seat
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center gap-2 text-[12px] text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Educational session — not
            investment advice
          </div>
        </div>
      </div>
    </section>
  );
}

export function FnoNinjaWebinarPage() {
  const [openModal, setOpenModal] = useState(false);
  const [sessionDate, setSessionDate] = useState<string | undefined>(undefined);
  const stats = useWebinarStats();
  const [bumped, setBumped] = useState(0);

  const open = (date?: string) => {
    setSessionDate(date);
    setOpenModal(true);
  };

  const displayCount = useMemo(() => {
    if (stats === null) return null;
    return stats + bumped;
  }, [stats, bumped]);

  return (
    <div className="font-sans antialiased flex flex-col flex-1">
      <WebinarHero onReserve={() => open()} count={displayCount} />
      <WebinarLearn />
      <WebinarForWho />
      <WebinarHost />
      <WebinarSchedule onReserve={(d) => open(d)} />
      <WebinarTestimonials />
      <WebinarFAQ />
      <WebinarFinalCTA onReserve={() => open()} count={displayCount} />

      <FnoNinjaWebinarRegisterModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        defaultSessionDate={sessionDate}
        onRegistered={() => setBumped((n) => n + 1)}
      />
    </div>
  );
}
