import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

export function FnoNinjaHero() {
  return (
    <section className="relative overflow-hidden border-b" style={{ borderColor: FNO_NAV_BORDER }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-[30%] -left-[20%] w-[70%] h-[80%] rounded-full blur-[140px]"
          style={{ backgroundColor: "rgba(29,185,120,0.06)" }}
        />
        <div
          className="absolute top-[5%] right-[-10%] w-[50%] h-[60%] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(29,185,120,0.04)" }}
        />
      </div>

      <div className={`relative ${FB_CONTENT_SHELL} py-14 sm:py-20 lg:py-24`}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 xl:gap-20 items-center">
          <div className="text-left min-w-0 flex flex-col gap-8 sm:gap-9 lg:gap-10">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-[3.25rem] font-black tracking-tight leading-[1.08] text-white">
              Map the{" "}
              <span style={{ color: FNO_ACCENT }}>F&amp;O</span> markets with precision.
            </h1>

            <p className="text-sm sm:text-base leading-relaxed max-w-md" style={{ color: FNO_MUTED }}>
              One map for the full NSE F&amp;O universe. See where open interest clusters and
              how price sits relative to derived support and resistance zones — built from public
              option-chain data, for your own research.
            </p>

            <div>
              <FnoNinjaCtaLink>See market map</FnoNinjaCtaLink>
            </div>

            <p className="text-[11px]" style={{ color: "#4b5563" }}>
              Informational only · Not investment advice
            </p>
          </div>

          <div className="min-w-0 w-full lg:mt-0 mt-4">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl"
              style={{
                border: "1px solid rgba(29,185,120,0.16)",
                backgroundColor: "#111618",
                boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(29,185,120,0.05)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5 border-b"
                style={{
                  borderColor: "rgba(29,185,120,0.1)",
                  backgroundColor: "rgba(10,13,14,0.95)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#eab308" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FNO_ACCENT }} />
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
