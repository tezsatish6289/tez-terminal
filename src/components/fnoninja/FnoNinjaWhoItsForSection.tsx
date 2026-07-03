import { BarChart3, Target, Zap } from "lucide-react";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const PERSONAS = [
  {
    icon: Zap,
    title: "Intraday Trader",
    subtitle: "Same-day · index & momentum",
    body: "Live NIFTY, BANKNIFTY, and FINNIFTY zones with a slideshow that cycles the heavy hitters.",
    tags: ["Slideshow mode", "Zone dashboard", "Index views"],
  },
  {
    icon: BarChart3,
    title: "F&O Trader",
    subtitle: "Options & futures · stock-specific",
    body: "OI-based zones across 200+ NSE F&O symbols. See where price sits relative to heavy open interest.",
    tags: ["Market map", "Symbol analytics", "Zone overlay"],
  },
  {
    icon: Target,
    title: "Swing Trader",
    subtitle: "Positional · 3–10 day horizon",
    body: "Put and call clusters that tend to act as support and resistance, without scanning hundreds of chains.",
    tags: ["Market map", "Zone dashboard", "In-zone screener"],
  },
] as const;

export function FnoNinjaWhoItsForSection() {
  return (
    <section id="personas" className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <SectionEyebrow>Who it&apos;s for</SectionEyebrow>
        <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Built for people who <GradientText>read the data, not the noise.</GradientText>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-400">
          Three trader types. One analytics surface. Informational views — your interpretation, your
          decision.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PERSONAS.map(({ icon: Icon, title, subtitle, body, tags }) => (
          <article
            key={title}
            className="group rounded-xl border p-6 transition hover:border-[#60a5fa]/30"
            style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3b82f6]/15 text-[#60a5fa]">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-slate-500">{subtitle}</p>
                <h3 className="text-lg font-bold tracking-tight text-white">{title}</h3>
              </div>
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-slate-400">{body}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-slate-400"
                  style={{ borderColor: "rgba(90,140,220,0.14)", backgroundColor: "rgba(148,163,184,0.05)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
