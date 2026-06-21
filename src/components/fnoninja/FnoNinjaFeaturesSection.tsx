import {
  BarChart3,
  Clock,
  Eye,
  Grid3X3,
  LineChart,
  MessageCircle,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_LOGO_MARK, FNO_MUTED } from "@/lib/fnoninja/theme";

const ATLAS_FEATURE = {
  title: "Atlas AI Coach",
  body: "Get hedged options and futures structures built from each symbol's zones, OI walls, and IV regime — with defined risk, invalidation levels, and estimated economics. Available on symbol charts and slideshow views. Education only, not investment advice.",
};

const FEATURES: {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: Grid3X3,
    title: "Market Map",
    body: "See the entire NSE F&O universe in one interactive view. Spot open interest clusters, price positioning, and major support/resistance zones instantly.",
  },
  {
    icon: BarChart3,
    title: "Symbol Analytics",
    body: "Deep-dive into any stock or index. Get clear derived support & resistance levels, open interest profiles, and key market structure metrics.",
  },
  {
    icon: LineChart,
    title: "Zone Dashboard",
    body: "Understand exactly where the current price stands relative to option-derived zones — designed purely for your own research and interpretation.",
  },
  {
    icon: Clock,
    title: "Live Data Refresh",
    body: "Real-time updates during market hours with visible last-updated timestamps so you always know how fresh the insights are.",
  },
  {
    icon: Presentation,
    title: "Slideshow Mode",
    body: "Effortlessly cycle through multiple symbols with structured charts, zone views, and analytics — perfect for quick market scans.",
  },
  {
    icon: Eye,
    title: "Smart Filters",
    body: "These filters allow you to sort and view symbols based on zone structure, open interest profiles, and volatility regimes — helping you explore the broader F&O market more efficiently.",
  },
  {
    icon: MessageCircle,
    title: "Community Chat",
    body: "A subscriber-only, moderated room to discuss market structure with other traders. Tag symbols with $NIFTY to share the exact chart — observations only, not advice.",
  },
];

const cardStyle = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.12)",
};

export function FnoNinjaFeaturesSection() {
  return (
    <section id="features" className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="mb-10 sm:mb-12 max-w-2xl">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          Features
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Engineered for clarity.
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          Data-driven views to navigate the F&amp;O universe with structure, not guesswork.
        </p>
      </div>

      <div
        className="relative mb-5 overflow-hidden rounded-2xl p-6 sm:p-8 lg:p-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(13,27,46,0.95) 0%, rgba(10,18,40,0.98) 100%)",
          border: "1px solid rgba(96,165,250,0.35)",
          boxShadow:
            "0 0 40px rgba(59,130,246,0.12), 0 0 60px rgba(139,92,246,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(96,165,250,0.18) 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(139,92,246,0.2))",
              border: "1px solid rgba(96,165,250,0.4)",
              boxShadow: "0 0 20px rgba(96,165,250,0.2)",
            }}
          >
            <Sparkles
              className="h-5 w-5 text-white"
              strokeWidth={2}
              style={{
                filter:
                  "drop-shadow(0 0 4px rgba(96,165,250,0.8)) drop-shadow(0 0 10px rgba(167,139,250,0.4))",
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                style={{
                  color: "#bfdbfe",
                  background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(96,165,250,0.12))",
                  border: "1px solid rgba(96,165,250,0.35)",
                }}
              >
                <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} />
                New
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: FNO_ACCENT }}
              >
                AI-powered
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white leading-snug tracking-tight">
              {ATLAS_FEATURE.title}
            </h3>
            <p className="mt-3 text-[13px] sm:text-sm leading-relaxed max-w-3xl" style={{ color: "#cbd5e1" }}>
              {ATLAS_FEATURE.body}
            </p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg mb-5"
              style={{ backgroundColor: FNO_LOGO_MARK }}
            >
              <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
            </div>
            <h3 className="text-base font-bold text-white leading-snug">{title}</h3>
            <p className="mt-2.5 text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
