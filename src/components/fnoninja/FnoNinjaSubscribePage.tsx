"use client";

import { Sparkles } from "lucide-react";
import { FnoNinjaPlanCards } from "@/components/fnoninja/FnoNinjaPlanCards";
import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

const FNO_BORDER = "rgba(90,140,220,0.2)";

export function FnoNinjaSubscribePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div
          className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300"
          style={{ borderColor: FNO_BORDER }}
        >
          <Sparkles className="h-3 w-3 text-[#60a5fa]" />
          Membership
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Charts and Sentiment are free to explore. Sign in for your {FNONINJA_FREE_TRIAL_DAYS}-day
          free trial, then pick a plan to keep full access.
        </p>
      </div>

      <FnoNinjaPlanCards showStatusBanner className="mt-10" ctaSource="subscribe" />

      <p className="mx-auto mt-8 max-w-lg text-center text-[11px] leading-relaxed text-slate-500">
        Secure payments via Razorpay, managed by Zoho Billing. Silver &amp; Gold auto-renew; cancel
        anytime. Day Pass is a one-time purchase. Informational data only — not investment advice.
      </p>
    </div>
  );
}
