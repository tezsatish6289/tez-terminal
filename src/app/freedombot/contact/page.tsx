"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { COUNTRIES, POPULAR_COUNTRY_CODES } from "@/lib/countries";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", mobile: "", email: "", country: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/freedombot/contact", {
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
  }, [form, isSubmitting]);

  const sortedCountries = [
    ...POPULAR_COUNTRY_CODES.map((c) => COUNTRIES.find((x) => x.code === c)).filter(Boolean),
    { code: "---", name: "─────────────────", dialCode: "" },
    ...COUNTRIES.filter((c) => !POPULAR_COUNTRY_CODES.includes(c.code)),
  ] as { code: string; name: string; dialCode: string }[];

  const inputStyle = {
    backgroundColor: "#060d1a",
    border: "1px solid rgba(90,140,220,0.2)",
    color: "#f0f4ff",
    fontSize: "16px",
  };

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: "rgba(8,15,30,0.85)", borderColor: "rgba(90,140,220,0.12)", backdropFilter: "blur(16px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>FreedomBot.ai</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Link href="/" className="flex items-center gap-2 text-sm mb-12 transition-colors hover:text-blue-300 w-fit" style={{ color: "#64748b" }}>
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
          style={{ backgroundColor: "rgba(37,99,235,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#93c5fd" }}
        >
          Contact Us
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-4 leading-tight">
          Get in{" "}
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}>
            touch
          </span>
        </h1>
        <p className="text-base leading-relaxed mb-12" style={{ color: "#94a3b8" }}>
          Have a question, issue, or just want to know more? We read every message and aim to
          respond within 2 business days.
        </p>

        {success ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: "rgba(34,197,94,0.1)" }}
            >
              <CheckCircle2 className="h-8 w-8" style={{ color: "#22c55e" }} />
            </div>
            <h2 className="text-2xl font-black mb-2" style={{ color: "#e2e8f0" }}>Message sent!</h2>
            <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>
              We&apos;ve received your message and will get back to you within 2 business days.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              Back to home
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name + Mobile */}
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
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.2)")}
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
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.2)")}
                />
              </div>
            </div>

            {/* Email + Country */}
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
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.2)")}
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
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.2)")}
                  >
                    <option value="" disabled>Select country</option>
                    {sortedCountries.map((c) =>
                      c.code === "---"
                        ? <option key="---" value="" disabled>{c.name}</option>
                        : <option key={c.code} value={c.name}>{c.name}</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#475569" }} />
                </div>
              </div>
            </div>

            {/* Message */}
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
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.2)")}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 4px 20px rgba(37,99,235,0.25)" }}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-4 w-4" /> Send Message</>
              )}
            </button>

            <p className="text-center text-xs" style={{ color: "#334155" }}>
              Your name, email and mobile are encrypted before storage.{" "}
              <Link href="/privacy" className="hover:text-blue-400 transition-colors" style={{ color: "#475569" }}>
                Privacy Policy
              </Link>
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <footer className="py-10" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: "#334155" }}>© 2026 FreedomBot.ai</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Privacy</Link>
            <Link href="/terms" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
