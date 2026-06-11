import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_ACCENT_SOFT, FNO_MUTED } from "@/lib/fnoninja/theme";

const PERSONAS = [
  {
    id: "P-01",
    title: "The Swing Participant",
    subtitle: "Positional trader · 3–10 day horizon",
    metricValue: "200+",
    metricLabel: "symbols watched",
    quote: "I need to know where the option market is leaning before I size up.",
    body: "Tracks option-derived zones across 200+ F&O symbols to frame conviction trades. Uses the market map to spot where price sits relative to heavy OI.",
    tags: ["Market map", "Zone dashboard", "Symbol analytics"],
  },
  {
    id: "P-02",
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
    title: "The Active Intraday User",
    subtitle: "Same-day decisions · index focused",
    metricValue: "3",
    metricLabel: "core indices",
    quote: "Show me where the action is, fast.",
    body: "Scans NIFTY, BANKNIFTY, FINNIFTY zones throughout the session. Slideshow mode keeps the heavy hitters cycling on a second monitor.",
    tags: ["Slideshow mode", "Zone dashboard", "Index views"],
  },
  {
    id: "P-04",
    title: "The Market Enthusiast",
    subtitle: "Learner · long-term observer",
    metricValue: "F&O",
    metricLabel: "full universe",
    quote: "I want to understand how positioning shifts.",
    body: "Explores how option-market structure evolves across expiries. Builds intuition by watching zones form, hold, and break — purely educational.",
    tags: ["Market map", "Historical views", "Filters"],
  },
] as const;

const cardStyle = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.18)",
};

export function FnoNinjaWhoItsForSection() {
  return (
    <section className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-12 mb-10 sm:mb-12">
        <div className="max-w-2xl">
          <p
            className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
            style={{ color: FNO_ACCENT }}
          >
            Who it&apos;s for
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
            Built for people who read the tape, not the noise.
          </h2>
        </div>
        <p
          className="text-sm sm:text-base leading-relaxed lg:max-w-sm lg:pt-10 lg:text-right shrink-0"
          style={{ color: FNO_MUTED }}
        >
          Four personas. One analytics surface. Every view is informational — your interpretation,
          your decision.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 lg:gap-5">
        {PERSONAS.map(
          ({ id, title, subtitle, metricValue, metricLabel, quote, body, tags }) => (
            <div key={id} className="rounded-2xl p-6 sm:p-7 lg:p-8 flex flex-col" style={cardStyle}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <span
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold font-mono tracking-wide"
                  style={{
                    backgroundColor: FNO_ACCENT_SOFT,
                    color: FNO_ACCENT,
                    border: "1px solid rgba(90,140,220,0.2)",
                  }}
                >
                  {id}
                </span>
                <div className="text-right">
                  <p
                    className="text-xl sm:text-2xl font-black font-mono leading-none"
                    style={{ color: FNO_ACCENT }}
                  >
                    {metricValue}
                  </p>
                  <p
                    className="mt-1 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "#475569" }}
                  >
                    {metricLabel}
                  </p>
                </div>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">{title}</h3>
              <p
                className="mt-1 text-[11px] font-bold uppercase tracking-widest"
                style={{ color: "#475569" }}
              >
                {subtitle}
              </p>

              <p className="mt-5 text-sm sm:text-[15px] italic text-white/90 leading-relaxed">
                &ldquo;{quote}&rdquo;
              </p>
              <p className="mt-4 text-[13px] sm:text-sm leading-relaxed flex-1" style={{ color: FNO_MUTED }}>
                {body}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      backgroundColor: "rgba(15,23,42,0.8)",
                      color: "#64748b",
                      border: "1px solid rgba(90,140,220,0.1)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
