import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

const PERSONAS = [
  {
    title: "Intraday Trader",
    subtitle: "Same-day · index & momentum focused",
    quote: "Show me where the action is, fast.",
    body: "Scans NIFTY, BANKNIFTY, and FINNIFTY zones throughout the session. Slideshow mode keeps the heavy hitters cycling so you react to live structure — not stale charts.",
    tags: ["Slideshow mode", "Zone dashboard", "Index views"],
  },
  {
    title: "F&O Trader",
    subtitle: "Options & futures · stock-specific",
    quote: "I need structured OI context across the F&O universe.",
    body: "Tracks option-derived zones across 200+ NSE F&O symbols. Uses the market map and symbol analytics to see where price sits relative to heavy open interest — your read, your call.",
    tags: ["Market map", "Symbol analytics", "Zone overlay"],
  },
  {
    title: "Swing Trader",
    subtitle: "Positional · 3–10 day horizon",
    quote: "I need to know where the option market is leaning before I size up.",
    body: "Frames conviction trades around put and call clusters that tend to act as support and resistance. Spots setups worth deeper analysis without scanning hundreds of chains manually.",
    tags: ["Market map", "Zone dashboard", "In-zone screener"],
  },
] as const;

const ROW_BORDER = "rgba(90,140,220,0.1)";

export function FnoNinjaWhoItsForSection() {
  return (
    <section className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          Who it&apos;s for
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Built for people who read the data, not the noise.
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          Three trader types. One analytics surface. Every view is informational — your
          interpretation, your decision.
        </p>
      </div>

      <div className="border-t" style={{ borderColor: ROW_BORDER }}>
        {PERSONAS.map(({ title, subtitle, quote, body, tags }) => (
          <article
            key={title}
            className="group grid grid-cols-1 gap-5 sm:gap-6 py-8 sm:py-9 lg:py-10 border-b px-1 sm:px-2 -mx-1 sm:-mx-2 transition-colors duration-200 hover:bg-white/[0.02] lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-x-10 xl:gap-x-14 lg:items-start"
            style={{ borderColor: ROW_BORDER }}
          >
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
          </article>
        ))}
      </div>
    </section>
  );
}
