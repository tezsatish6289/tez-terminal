import {
  BarChart3,
  Clock,
  Grid3X3,
  Layers,
  MessageCircle,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_CARD_BG,
  FNO_LOGO_MARK,
  FNO_MUTED,
  FNO_TEXT,
} from "@/lib/fnoninja/theme";

const CARD_BORDER = "1px solid rgba(90,140,220,0.14)";

const GRID_FEATURES: {
  icon: LucideIcon;
  title: string;
  tagline: string;
  body: string[];
}[] = [
  {
    icon: Grid3X3,
    title: "Market Map",
    tagline: "The entire F&O market. One screen.",
    body: [
      "Instantly spot where traders are building positions and where market attention is concentrated.",
    ],
  },
  {
    icon: BarChart3,
    title: "Symbol Analytics",
    tagline: "Everything that matters. Nothing that doesn't.",
    body: [
      "Open interest, volatility, key zones, and market structure—organized in one place.",
    ],
  },
  {
    icon: Layers,
    title: "Zone Overlay",
    tagline: "No more drawing levels.",
    body: [
      "Important option-chain zones are automatically plotted on the chart.",
      "See the levels. Focus on the market.",
    ],
  },
  {
    icon: Clock,
    title: "Live Data",
    tagline: "Fresh data. Visible timestamps.",
    body: ["Know exactly when the market structure changed."],
  },
  {
    icon: Presentation,
    title: "Slideshow Mode",
    tagline: "Stop opening chart after chart.",
    body: [
      "Sit back and let FNO Ninja walk you through the market.",
      "One screen. One flow. Dozens of symbols.",
    ],
  },
];

const COMMUNITY = {
  icon: MessageCircle,
  title: "Community",
  tagline: "Learn with serious traders.",
  body: [
    "Discuss market structure, share observations, and see how others interpret the same data.",
    "Focused conversations. Zero noise.",
  ],
};

function FeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: FNO_LOGO_MARK }}
    >
      <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  tagline,
  body,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  tagline: string;
  body: string[];
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-6 sm:p-7 ${className}`}
      style={{ backgroundColor: FNO_CARD_BG, border: CARD_BORDER }}
    >
      <FeatureIcon icon={icon} />
      <h3 className="mt-5 text-base sm:text-[17px] font-bold leading-snug" style={{ color: FNO_TEXT }}>
        {title}
      </h3>
      <p className="mt-2 text-[13px] sm:text-sm font-semibold leading-snug text-white/85">{tagline}</p>
      <div className="mt-3 space-y-2">
        {body.map((line) => (
          <p key={line} className="text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export function FnoNinjaFeaturesSection() {
  return (
    <section id="features" className={`${FB_CONTENT_SHELL} relative py-16 sm:py-20 lg:py-28`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute left-1/2 top-0 h-[360px] w-[min(900px,100%)] -translate-x-1/2 rounded-full blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <span
          className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{
            color: FNO_ACCENT,
            border: "1px solid rgba(96,165,250,0.35)",
            backgroundColor: "rgba(96,165,250,0.06)",
          }}
        >
          Features
        </span>
        <h2 className="mt-6 text-3xl sm:text-4xl lg:text-[2.65rem] font-black text-white tracking-tight leading-[1.12]">
          Built for Clarity in the Chaos of F&amp;O
        </h2>
        <p
          className="mt-5 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto"
          style={{ color: FNO_MUTED }}
        >
          Data-driven visualizations that turn overwhelming option chain noise into structured,
          actionable market structure — for your own research and interpretation
        </p>
      </div>

      <div className="relative mt-12 sm:mt-14 space-y-4 lg:space-y-5">
        {/* Atlas AI — featured full-width card */}
        <div
          className="rounded-2xl p-6 sm:p-8 lg:p-9"
          style={{
            backgroundColor: FNO_CARD_BG,
            border: "1px solid rgba(96,165,250,0.28)",
          }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "rgba(59,130,246,0.2)",
                border: "1px solid rgba(96,165,250,0.35)",
              }}
            >
              <Sparkles className="h-5 w-5 fynn-coach-sparkle" strokeWidth={2} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">Atlas AI</h3>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    color: "#bfdbfe",
                    border: "1px solid rgba(96,165,250,0.35)",
                    backgroundColor: "rgba(59,130,246,0.12)",
                  }}
                >
                  New
                </span>
              </div>
              <p className="mt-2 text-sm sm:text-base font-semibold text-white/90">
                Ask. Explore. Learn.
              </p>
              <p className="mt-3 text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
                Your AI research companion for understanding market structure, option positioning,
                and volatility conditions.
              </p>
              <p className="mt-3 text-[12px] font-medium uppercase tracking-wide" style={{ color: FNO_ACCENT }}>
                Education &amp; research only.
              </p>
            </div>
          </div>
        </div>

        {/* 3-column feature grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {GRID_FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        {/* Community — full-width bottom card */}
        <FeatureCard {...COMMUNITY} />
      </div>
    </section>
  );
}
