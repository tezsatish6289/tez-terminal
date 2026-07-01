import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FnoNinjaProblemChartShowcase } from "@/components/fnoninja/FnoNinjaProblemChartShowcase";
import { FB_WIDE_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

const INNER_PANEL = {
  border: FNO_CARD_BORDER,
  backgroundColor: "rgba(8,15,30,0.55)",
} as const;

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <div className={`${FB_WIDE_SHELL} pt-16 sm:pt-20 lg:pt-24 pb-20 sm:pb-24 lg:pb-32`}>
        <header className="mb-8 sm:mb-10 lg:mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
            See the Big Picture Instantly
          </h2>
        </header>

        <div
          className="rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          style={{
            border: FNO_CARD_BORDER,
            backgroundColor: FNO_CARD_BG,
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(90,140,220,0.06)",
          }}
        >
          <FnoNinjaMarketTicker embedded />

          <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-3 sm:gap-4 p-3 sm:p-4 lg:p-5">
            <div
              className="flex flex-col justify-center lg:w-[38%] xl:w-[36%] lg:shrink-0 rounded-xl sm:rounded-2xl p-6 sm:p-8 lg:p-9 xl:p-10"
              style={INNER_PANEL}
            >
              <h2 className="text-xl sm:text-[1.35rem] lg:text-[1.65rem] xl:text-[1.85rem] font-black text-white tracking-tight leading-[1.18] flex flex-col gap-4 sm:gap-5 lg:gap-6">
                <span>Option chain data is powerful — but tracking hundreds of stocks is exhausting.</span>
                <span style={{ color: FNO_ACCENT }}>
                  We handle the data so you can focus on the opportunities.
                </span>
              </h2>
            </div>

            <div className="flex-1 min-w-0 min-h-0">
              <FnoNinjaProblemChartShowcase />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
