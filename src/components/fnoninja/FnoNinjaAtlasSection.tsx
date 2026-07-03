import { FnoNinjaLoginLink } from "@/components/fnoninja/FnoNinjaLoginPage";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  LANDING_SHIMMER,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const ATLAS_FEATURES = [
  "Symbol & zone context",
  "Plain-English answers",
  "Built on FNO Ninja data",
  "Always available",
] as const;

export function FnoNinjaAtlasSection() {
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 70% 35%, rgba(59,130,246,0.11), transparent 60%), radial-gradient(55% 45% at 25% 55%, rgba(139,92,246,0.06), transparent 55%)",
        }}
      />
      <div className={`${FNO_LANDING_SHELL} relative py-16 sm:py-20 lg:py-24`}>
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="flex flex-col justify-center">
            <div className="mb-6 flex items-center gap-3">
              <SectionEyebrow>ATLAS AI</SectionEyebrow>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#60a5fa]">
                Included in every plan
              </span>
            </div>

            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.8rem] lg:leading-[1.08] text-white">
              Ask ATLAS <GradientText>AI.</GradientText>{" "}
              <GradientText>Read the market like an analyst.</GradientText>
            </h2>

            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-slate-400">
              An AI research assistant built on the same FNO Ninja data. Ask about any symbol, level,
              or setup and get plain-English context grounded in option-chain structure.
            </p>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-slate-300">
              {ATLAS_FEATURES.map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#3b82f6]/20 text-[10px] text-[#60a5fa]">
                    ✓
                  </span>
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <FnoNinjaLoginLink className={LANDING_PRIMARY_CTA}>
                <span className={LANDING_SHIMMER} />
                Chat with ATLAS
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </FnoNinjaLoginLink>
              <span className="text-xs text-slate-500">Sign in to access Atlas on any chart</span>
            </div>
          </div>

          <div className="relative">
            <div
              className="overflow-hidden rounded-2xl border bg-[#0d1830]/70 shadow-2xl backdrop-blur"
              style={{ borderColor: FNO_LANDING_BORDER }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.45)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#6366f1] text-[14px] font-black text-white ring-1 ring-white/15">
                    AI
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">ATLAS</p>
                    <p className="text-[11px] text-slate-500">F&amp;O research assistant</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Live
                </span>
              </div>

              <div className="space-y-4 px-5 py-6 text-[13px]">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-slate-300">
                  Key levels for NIFTY?
                </div>

                <div className="ml-auto max-w-[92%]">
                  <div className="rounded-2xl rounded-tr-sm border border-[#3b82f6]/20 bg-gradient-to-br from-[#3b82f6]/12 to-[#3b82f6]/5 px-3.5 py-2.5 text-white">
                    Put Cluster at <span className="font-semibold text-[#60a5fa]">24,000</span> and Call
                    Cluster at <span className="font-semibold text-[#60a5fa]">24,400</span>. Heavy OI
                    means price often reacts around these zones.
                  </div>
                  <p className="mt-1.5 pr-1 text-[10px] text-slate-500">Answered in 0.4s</p>
                </div>
              </div>

              <div
                className="border-t px-5 py-3"
                style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.45)" }}
              >
                <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}>
                  <span className="text-slate-600">›</span>
                  <span className="flex-1 truncate text-[13px] text-slate-500">Ask ATLAS anything...</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#3b82f6] text-white">↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
