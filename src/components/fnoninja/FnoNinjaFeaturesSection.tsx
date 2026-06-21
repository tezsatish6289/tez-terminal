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
  FNO_GRADIENT_TEXT,
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
  {
    icon: MessageCircle,
    title: "Community",
    tagline: "Learn with serious traders.",
    body: [
      "Discuss market structure, share observations, and see how others interpret the same data.",
      "Focused conversations. Zero noise.",
    ],
  },
];

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

function AtlasFeaturedCard() {
  return (
    <div className="features-atlas-shell rounded-2xl">
      <div
        className="features-atlas-inner relative overflow-hidden rounded-[15px] p-6 sm:p-8 lg:p-9"
        style={{ backgroundColor: FNO_CARD_BG }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          aria-hidden
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(96,165,250,0.55) 25%, rgba(167,139,250,0.45) 50%, rgba(96,165,250,0.55) 75%, transparent)",
          }}
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(145deg, rgba(59,130,246,0.28), rgba(139,92,246,0.14))",
              border: "1px solid rgba(96,165,250,0.4)",
            }}
          >
            <Sparkles className="h-6 w-6 fynn-coach-sparkle" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Atlas AI</h3>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  color: "#bfdbfe",
                  border: "1px solid rgba(96,165,250,0.4)",
                  backgroundColor: "rgba(59,130,246,0.12)",
                }}
              >
                New
              </span>
            </div>

            <p
              className="mt-2 text-base sm:text-lg font-bold tracking-tight"
              style={{
                background: FNO_GRADIENT_TEXT,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Ask. Explore. Learn.
            </p>

            <p className="mt-3 max-w-2xl text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
              Your AI research companion for understanding market structure, option positioning,
              and volatility conditions.
            </p>

            <p
              className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: FNO_ACCENT }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: FNO_ACCENT, boxShadow: "0 0 6px rgba(96,165,250,0.8)" }}
              />
              Education &amp; research only
            </p>
          </div>

          <div
            className="hidden lg:flex shrink-0 flex-col gap-2 rounded-xl px-4 py-3 text-right"
            style={{
              border: "1px solid rgba(96,165,250,0.2)",
              backgroundColor: "rgba(59,130,246,0.06)",
            }}
          >
            {["Zones", "OI walls", "IV regime"].map((label) => (
              <span
                key={label}
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "rgba(191,219,254,0.85)" }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
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
        <AtlasFeaturedCard />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {GRID_FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
