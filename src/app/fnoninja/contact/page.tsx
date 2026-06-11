"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { COUNTRIES, POPULAR_COUNTRY_CODES } from "@/lib/countries";
import { FB_COMPACT_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LEGAL_CTA_STYLE,
  FNO_LEGAL_INPUT_STYLE,
  FnoNinjaLegalBadge,
  FnoNinjaLegalFooter,
  FnoNinjaLegalIntro,
  FnoNinjaLegalTitle,
} from "@/components/fnoninja/FnoNinjaLegalShell";
import { FNO_ACCENT, FNO_CARD_BG, FNO_MUTED } from "@/lib/fnoninja/theme";

export default function FnoNinjaContactPage() {
  const [form, setForm] = useState({ name: "", mobile: "", email: "", country: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const set = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      setError("");
      setIsSubmitting(true);
      try {
        const res = await fetch("/api/fnoninja/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        setSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, isSubmitting],
  );

  const sortedCountries = [
    ...POPULAR_COUNTRY_CODES.map((c) => COUNTRIES.find((x) => x.code === c)).filter(Boolean),
    { code: "---", name: "─────────────────", dialCode: "" },
    ...COUNTRIES.filter((c) => !POPULAR_COUNTRY_CODES.includes(c.code)),
  ] as { code: string; name: string; dialCode: string }[];

  return (
    <div className={`${FB_COMPACT_SHELL} py-12 sm:py-20 min-w-0`}>
      <Link
        href="/"
        className="flex items-center gap-2 text-sm mb-12 transition-colors hover:text-white w-fit"
        style={{ color: FNO_MUTED }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <FnoNinjaLegalBadge label="Contact Us" />
      <FnoNinjaLegalTitle>
        Get in{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
        >
          touch
        </span>
      </FnoNinjaLegalTitle>
      <FnoNinjaLegalIntro>
        Have a question about the market map, symbol analytics, or your account? We read every
        message and aim to respond within 2 business days.
      </FnoNinjaLegalIntro>

      {success ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ backgroundColor: FNO_CARD_BG, border: "1px solid rgba(34,197,94,0.25)" }}
        >
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: "rgba(34,197,94,0.1)" }}
          >
            <CheckCircle2 className="h-8 w-8" style={{ color: "#22c55e" }} />
          </div>
          <h2 className="text-2xl font-black mb-2 text-white">Message sent!</h2>
          <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>
            We&apos;ve received your message and will get back to you within 2 business days.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
            style={FNO_LEGAL_CTA_STYLE}
          >
            Back to home
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="Your full name"
                required
                className="w-full px-4 py-3 rounded-xl outline-none transition-all placeholder-slate-700"
                style={FNO_LEGAL_INPUT_STYLE}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                Mobile
              </label>
              <input
                type="tel"
                value={form.mobile}
                onChange={set("mobile")}
                placeholder="+91 98765 43210"
                className="w-full px-4 py-3 rounded-xl outline-none transition-all placeholder-slate-700"
                style={FNO_LEGAL_INPUT_STYLE}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                Email <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-xl outline-none transition-all placeholder-slate-700"
                style={FNO_LEGAL_INPUT_STYLE}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                Country <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div className="relative">
                <select
                  value={form.country}
                  onChange={set("country")}
                  required
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all appearance-none"
                  style={{ ...FNO_LEGAL_INPUT_STYLE, paddingRight: "2.5rem" }}
                >
                  <option value="" disabled>
                    Select country
                  </option>
                  {sortedCountries.map((c) =>
                    c.code === "---" ? (
                      <option key="---" value="" disabled>
                        {c.name}
                      </option>
                    ) : (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ),
                  )}
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "#475569" }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
              Message <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              value={form.message}
              onChange={set("message")}
              placeholder="Tell us what's on your mind…"
              required
              rows={5}
              className="w-full px-4 py-3 rounded-xl outline-none transition-all placeholder-slate-700 resize-none"
              style={FNO_LEGAL_INPUT_STYLE}
            />
          </div>

          {error && (
            <div
              className="px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            style={FNO_LEGAL_CTA_STYLE}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send Message
              </>
            )}
          </button>

          <p className="text-center text-xs" style={{ color: "#334155" }}>
            Your name, email and mobile are encrypted before storage.{" "}
            <Link href="/privacy" className="hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
              Privacy Policy
            </Link>
          </p>
        </form>
      )}

      <FnoNinjaLegalFooter />
    </div>
  );
}
