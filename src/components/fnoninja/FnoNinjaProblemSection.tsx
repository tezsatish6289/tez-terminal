import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FnoNinjaProblemChartShowcase } from "@/components/fnoninja/FnoNinjaProblemChartShowcase";
import { FB_WIDE_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <FnoNinjaMarketTicker />

      <div className={`${FB_WIDE_SHELL} py-12 sm:py-16 lg:py-20`}>
        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-8 lg:gap-10 xl:gap-12 items-center">
          <h2 className="pl-6 sm:pl-8 lg:pl-10 xl:pl-12 max-w-xl lg:max-w-none text-2xl sm:text-3xl lg:text-[2.35rem] xl:text-[2.65rem] font-black text-white tracking-tight leading-[1.12] flex flex-col gap-5 sm:gap-6 lg:gap-8">
            <span>Option chain data is powerful — but tracking hundreds of stocks is exhausting.</span>
            <span style={{ color: FNO_ACCENT }}>
              We handle the data so you can focus on the opportunities.
            </span>
          </h2>

          <FnoNinjaProblemChartShowcase />
        </div>
      </div>
    </section>
  );
}
