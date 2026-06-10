import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_UNIVERSE } from "@/lib/nse/fno-universe";
import { FNO_GRADIENT_TEXT, FNO_MUTED } from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

export function FnoNinjaHero() {
  const symbolCount = FNO_UNIVERSE.length;

  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-[30%] -left-[20%] w-[70%] h-[80%] rounded-full blur-[140px]"
          style={{ backgroundColor: "rgba(37,99,235,0.07)" }}
        />
        <div
          className="absolute top-[5%] right-[-10%] w-[50%] h-[60%] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(96,165,250,0.05)" }}
        />
      </div>

      <div className={`relative ${FB_CONTENT_SHELL} py-12 sm:py-16 lg:py-20`}>
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 xl:gap-16 items-center">
          {/* Left — copy */}
          <div className="text-left min-w-0">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6"
              style={{
                backgroundColor: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(52,211,153,0.25)",
                color: "#34d399",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              NSE F&amp;O analytics · Live map
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-[3.25rem] font-black tracking-tight leading-[1.08] text-white">
              Map the{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: FNO_GRADIENT_TEXT }}
              >
                F&amp;O
              </span>{" "}
              markets with precision.
            </h1>

            <p className="mt-5 text-sm sm:text-base leading-relaxed max-w-lg" style={{ color: FNO_MUTED }}>
              One map for the full NSE F&amp;O universe. See where open interest clusters and
              how price sits relative to derived support and resistance zones — built from public
              option-chain data, for your own research.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <FnoNinjaCtaLink>Launch analytics</FnoNinjaCtaLink>
              <FnoNinjaCtaLink variant="secondary">Open full dashboard</FnoNinjaCtaLink>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {symbolCount}+
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mt-1"
                  style={{ color: "#475569" }}
                >
                  F&amp;O symbols
                </p>
              </div>
              <div>
                <p
                  className="text-2xl sm:text-3xl font-black tabular-nums bg-clip-text text-transparent"
                  style={{ backgroundImage: FNO_GRADIENT_TEXT }}
                >
                  4
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mt-1"
                  style={{ color: "#475569" }}
                >
                  Major indices
                </p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-white">2:1</p>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mt-1"
                  style={{ color: "#475569" }}
                >
                  POC reward:risk filter
                </p>
              </div>
            </div>

            <p className="mt-6 text-[11px]" style={{ color: "#334155" }}>
              Informational only · Not investment advice
            </p>
          </div>

          {/* Right — terminal + live bubble map */}
          <div className="min-w-0 w-full">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl"
              style={{
                border: "1px solid rgba(90,140,220,0.18)",
                backgroundColor: "#0a1628",
                boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(90,140,220,0.06)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5 border-b"
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
              <div className="relative aspect-[4/3] sm:aspect-[5/4] lg:aspect-[4/3] min-h-[260px] sm:min-h-[300px] lg:min-h-[340px] bg-[#060912]">
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
