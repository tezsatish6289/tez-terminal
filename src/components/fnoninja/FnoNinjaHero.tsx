import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_GRADIENT_TEXT, FNO_MUTED } from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

export function FnoNinjaHero() {
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

      <div className={`relative ${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-28`}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 xl:gap-20 items-center">
          <div className="text-left min-w-0 flex flex-col">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-10 sm:mb-12"
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

            <p
              className="mt-8 sm:mt-10 text-sm sm:text-base leading-relaxed max-w-md"
              style={{ color: FNO_MUTED }}
            >
              One map for the full NSE F&amp;O universe. See where open interest clusters and
              how price sits relative to derived support and resistance zones — built from public
              option-chain data, for your own research.
            </p>

            <div className="mt-10 sm:mt-12">
              <FnoNinjaCtaLink>See market map</FnoNinjaCtaLink>
            </div>

            <p className="mt-10 sm:mt-12 text-[11px]" style={{ color: "#334155" }}>
              Informational only · Not investment advice
            </p>
          </div>

          <div className="min-w-0 w-full lg:mt-0 mt-4">
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
