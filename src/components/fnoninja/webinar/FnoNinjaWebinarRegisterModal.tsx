"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, PlayCircle, X } from "lucide-react";
import { FNO_LANDING_BORDER, registerForWebinar } from "@/lib/fnoninja/landing-ui";
import {
  formatWebinarSession,
  getUpcomingWebinarSessions,
  getWebinarSessionByIstDate,
  googleCalendarUrl,
} from "@/lib/fnoninja/webinar";

type RegisterState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      sessionDate: string;
      youtubeWatchUrl: string | null;
      calendarInvite: boolean;
    };

type Props = {
  open: boolean;
  onClose: () => void;
  defaultSessionDate?: string;
  onRegistered?: () => void;
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
  required,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
        className={fieldClass}
        style={{ borderColor: FNO_LANDING_BORDER }}
      />
    </label>
  );
}

const fieldClass =
  "w-full rounded-lg border bg-[#0d1830]/60 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-slate-500/60 focus:border-[#60a5fa]/60 focus:bg-[#0d1830]/90";

function SelectField({
  label,
  value,
  onChange,
  required,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`${fieldClass} cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9`}
        style={{
          borderColor: FNO_LANDING_BORDER,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function FnoNinjaWebinarRegisterModal({
  open,
  onClose,
  defaultSessionDate,
  onRegistered,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [state, setState] = useState<RegisterState>({ kind: "idle" });
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);

  const upcomingSessions = useMemo(() => getUpcomingWebinarSessions(12), []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setState({ kind: "idle" });
    const fallback = upcomingSessions[0]?.istDate ?? "";
    const preferred =
      defaultSessionDate && getWebinarSessionByIstDate(defaultSessionDate)
        ? defaultSessionDate
        : fallback;
    setSessionDate(preferred);
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, defaultSessionDate, upcomingSessions]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind === "submitting") return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMobile = mobile.trim();

    if (!trimmedName) return setState({ kind: "error", message: "Please enter your name." });
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail))
      return setState({ kind: "error", message: "Please enter a valid email." });
    if (trimmedMobile.replace(/\D/g, "").length < 7)
      return setState({ kind: "error", message: "Please enter a valid mobile number." });
    if (!sessionDate || !getWebinarSessionByIstDate(sessionDate))
      return setState({ kind: "error", message: "Please pick a session date and time." });

    setState({ kind: "submitting" });
    try {
      const res = await registerForWebinar({
        name: trimmedName,
        email: trimmedEmail,
        mobile: trimmedMobile,
        sessionDate,
        source: "fnoninja.com/webinar",
      });
      setState({
        kind: "success",
        sessionDate: res.sessionDate,
        youtubeWatchUrl: res.youtubeWatchUrl,
        calendarInvite: res.calendarInvite,
      });
      onRegistered?.();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  };

  const session = state.kind === "success" ? getWebinarSessionByIstDate(state.sessionDate) : null;
  const gcalHref = session ? googleCalendarUrl(session) : null;
  const successLabel = session ? formatWebinarSession(session) : state.kind === "success" ? state.sessionDate : "";

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webinar-register-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-[#0a1220] shadow-2xl"
        style={{ borderColor: FNO_LANDING_BORDER }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-[#131a28] hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {state.kind === "success" ? (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-xl font-black tracking-tight text-white">You&apos;re in.</h3>
            <p className="mt-2 text-[14px] text-slate-400">
              We&apos;ve reserved your seat for{" "}
              <span className="font-semibold text-white">{successLabel}</span>.
              {state.calendarInvite
                ? " A calendar invite is on its way to your inbox."
                : " Check your email for details."}
            </p>
            {state.youtubeWatchUrl && (
              <a
                href={state.youtubeWatchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2563eb]"
              >
                <PlayCircle className="h-4 w-4" /> Open YouTube livestream
              </a>
            )}
            {gcalHref && (
              <a
                href={gcalHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block w-full rounded-lg border py-2.5 text-[13px] font-semibold text-[#93c5fd] transition hover:text-white"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                Add to Google Calendar
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 block w-full rounded-lg border py-2.5 text-[13px] font-semibold text-slate-400 transition hover:text-white"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-6 sm:p-7">
            <div className="pr-8">
              <div
                className="inline-flex items-center gap-2 rounded-full border bg-[#0d1830]/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#60a5fa]"
                style={{ borderColor: FNO_LANDING_BORDER }}
              >
                Free · 60 min
              </div>
              <h3 id="webinar-register-title" className="mt-3 text-xl font-black tracking-tight text-white">
                Reserve your free seat
              </h3>
              <p className="mt-1.5 text-[13px] text-slate-400">
                We&apos;ll email your join link and calendar invite.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <SelectField
                label="Session date & time (IST)"
                value={sessionDate}
                onChange={setSessionDate}
                required
              >
                {upcomingSessions.map((s) => (
                  <option key={s.istDate} value={s.istDate} className="bg-[#0a1220]">
                    {formatWebinarSession(s)}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Full name"
                inputRef={firstInputRef}
                value={name}
                onChange={setName}
                placeholder="Your name"
                autoComplete="name"
                maxLength={120}
                required
              />
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={255}
                required
              />
              <Field
                label="Mobile"
                type="tel"
                value={mobile}
                onChange={setMobile}
                placeholder="+91 98xxxxxxxx"
                autoComplete="tel"
                maxLength={20}
                required
              />
            </div>

            {state.kind === "error" && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12.5px] text-red-400"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{state.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={state.kind === "submitting"}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b82f6] px-4 py-3 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {state.kind === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reserving…
                </>
              ) : (
                <>
                  Reserve my seat <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[11px] text-slate-500">
              No credit card · Educational session, not investment advice
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
