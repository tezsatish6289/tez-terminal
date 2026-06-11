import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

const PERSONAS = [
  {
    id: "P-01",
    index: "01",
    title: "The Swing Participant",
    subtitle: "Positional · 3–10 day horizon",
    metricValue: "200+",
    metricLabel: "symbols",
    quote: "I need to know where the option market is leaning before I size up.",
    body: "Tracks option-derived zones across 200+ F&O symbols to frame conviction trades. Uses the market map to spot where price sits relative to heavy OI.",
    tags: ["Market map", "Zone dashboard", "Symbol analytics"],
  },
  {
    id: "P-02",
    index: "02",
    title: "The Quant Researcher",
    subtitle: "Strategy builder · data-driven",
    metricValue: "Live",
    metricLabel: "session data",
    quote: "I want structured OI context — not opinions.",
    body: "Studies open-interest concentrations and price positioning to backtest hypotheses and build systematic playbooks around derived levels.",
    tags: ["Symbol analytics", "Display filters", "Scheduled refresh"],
  },
  {
    id: "P-03",
    index: "03",
    title: "The Active Intraday User",
    subtitle: "Same-day · index focused",
    metricValue: "3",
    metricLabel: "core indices",
    quote: "Show me where the action is, fast.",
    body: "Scans NIFTY, BANKNIFTY, FINNIFTY zones throughout the session. Slideshow mode keeps the heavy hitters cycling on a second monitor.",
    tags: ["Slideshow mode", "Zone dashboard", "Index views"],
  },
  {
    id: "P-04",
    index: "04",
    title: "The Market Enthusiast",
    subtitle: "Learner · long-term observer",
    metricValue: "F&O",
    metricLabel: "full universe",
    quote: "I want to understand how positioning shifts.",
    body: "Explores how option-market structure evolves across expiries. Builds intuition by watching zones form, hold, and break — purely educational.",
    tags: ["Market map", "Historical views", "Filters"],
  },
] as const;

const ROW_BORDER = "rgba(90,140,220,0.1)";

export function FnoNinjaWhoItsForSection() {
  const total = PERSONAS.length;

  return (
    <section className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          Who it&apos;s for
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Built for people who read the tape, not the noise.
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          Four personas. One analytics surface. Every view is informational — your interpretation,
          your decision.
        </p>
      </div>

      <div className="border-t" style={{ borderColor: ROW_BORDER }}>
        {PERSONAS.map(({ id, index, title, subtitle, metricValue, metricLabel, quote, body, tags }) => (
          <article
            key={id}
            className="group grid grid-cols-1 gap-5 sm:gap-6 py-8 sm:py-9 lg:py-10 border-b px-1 sm:px-2 -mx-1 sm:-mx-2 transition-colors duration-200 hover:bg-white/[0.02] lg:grid-cols-[4.5rem_11rem_minmax(0,1fr)_5.5rem] lg:gap-x-8 xl:gap-x-12 lg:items-start"
            style={{ borderColor: ROW_BORDER }}
          >
            <div className="flex lg:flex-col items-center lg:items-start justify-between lg:justify-start gap-2 font-mono text-[11px] sm:text-xs tracking-wide">
              <span
                className="font-bold transition-colors duration-200 text-[rgba(96,165,250,0.45)] group-hover:text-[#60a5fa]"
              >
                {id}
              </span>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#334155" }}>
                {index} / {String(total).padStart(2, "0")}
              </span>
            </div>

            <div className="min-w-0">
              <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug transition-colors duration-200 group-hover:text-[#60a5fa]">
                {title}
              </h3>
              <p
                className="mt-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest leading-relaxed"
                style={{ color: "#475569" }}
              >
                {subtitle}
              </p>
            </div>

            <div className="min-w-0 lg:pr-4">
              <p
                className="text-sm sm:text-[15px] italic leading-relaxed"
                style={{ color: FNO_ACCENT }}
              >
                &ldquo;{quote}&rdquo;
              </p>
              <p className="mt-3 text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
                {body}
              </p>
              <p
                className="mt-4 text-[10px] font-bold uppercase tracking-widest leading-relaxed"
                style={{ color: "#334155" }}
              >
                {tags.map((tag, tagIndex) => (
                  <span key={tag}>
                    {tagIndex > 0 ? <span className="mx-1.5 opacity-40">·</span> : null}
                    {tag}
                  </span>
                ))}
              </p>
            </div>

            <div className="text-left lg:text-right shrink-0">
              <p
                className="text-2xl sm:text-3xl font-black font-mono leading-none"
                style={{ color: FNO_ACCENT }}
              >
                {metricValue}
              </p>
              <p
                className="mt-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#475569" }}
              >
                {metricLabel}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
