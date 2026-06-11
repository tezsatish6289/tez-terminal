import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_BG_CANVAS,
  FNO_HERO_TEXTURE,
  FNO_HERO_TEXTURE_SIZE,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

export function FnoNinjaHero() {
  return (
    <section
      className="relative border-b flex flex-col min-h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] sm:overflow-hidden"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: FNO_HERO_TEXTURE,
            backgroundSize: FNO_HERO_TEXTURE_SIZE,
          }}
        />
        <div
          className="absolute -top-[30%] -left-[20%] w-[70%] h-[80%] rounded-full blur-[140px]"
          style={{ backgroundColor: "rgba(37,99,235,0.07)" }}
        />
        <div
          className="absolute top-[5%] right-[-10%] w-[50%] h-[60%] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(96,165,250,0.05)" }}
        />
      </div>

      <div
        className={`relative ${FB_CONTENT_SHELL} flex-1 flex flex-col min-h-0 py-6 sm:py-8 lg:py-10`}
      >
        <div className="grid flex-1 min-h-0 lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16 items-center lg:items-stretch">
          <div className="text-left min-w-0 flex flex-col justify-center gap-7 sm:gap-8 lg:gap-9 lg:py-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-[3.25rem] font-black tracking-tight leading-[1.08] text-white">
              See the Entire <span style={{ color: FNO_ACCENT }}>F&amp;O</span> Market at a Glance
            </h1>

            <p className="text-sm sm:text-base leading-relaxed max-w-lg" style={{ color: FNO_MUTED }}>
              See one interactive map of the full NSE F&amp;O market. Instantly spot open interest
              clusters and key price zones — built from live option data.
            </p>

            <div>
              <FnoNinjaCtaLink>Explore live market map</FnoNinjaCtaLink>
            </div>

            <p className="text-[11px]" style={{ color: "#334155" }}>
              Informational only · Not investment advice
            </p>
          </div>

          <div className="min-w-0 w-full flex flex-col min-h-[min(50vh,400px)] lg:min-h-0 lg:flex-1">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl flex flex-col flex-1 min-h-0 h-full"
              style={{
                border: "1px solid rgba(90,140,220,0.18)",
                backgroundColor: "#0a1628",
                boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(90,140,220,0.06)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0"
                style={{
                  borderColor: "rgba(90,140,220,0.12)",
                  backgroundColor: "rgba(8,15,30,0.9)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#eab308" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                <span
                  className="ml-2 text-[10px] font-mono font-medium truncate"
                  style={{ color: "#64748b" }}
                >
                  NSE-FNO-MARKET-MAP
                </span>
              </div>
              <div
                className="relative flex-1 min-h-[200px]"
                style={{ backgroundColor: FNO_BG_CANVAS }}
              >
                <iframe
                  src={EMBED_SRC}
                  title="NSE F&O market bubble map"
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  scrolling="no"
                  referrerPolicy="same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
