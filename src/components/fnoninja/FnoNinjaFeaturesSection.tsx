import {
  BarChart3,
  Clock,
  Eye,
  Grid3X3,
  LineChart,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_LOGO_MARK, FNO_MUTED } from "@/lib/fnoninja/theme";

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
