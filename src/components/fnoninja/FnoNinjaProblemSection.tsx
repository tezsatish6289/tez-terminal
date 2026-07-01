import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FnoNinjaProblemChartShowcase } from "@/components/fnoninja/FnoNinjaProblemChartShowcase";
import { FB_WIDE_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <FnoNinjaMarketTicker />

      <div className={`${FB_WIDE_SHELL} pt-12 sm:pt-16 lg:pt-20 pb-20 sm:pb-24 lg:pb-32`}>
        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-8 lg:gap-10 xl:gap-12 items-start">
          <h2 className="pl-6 sm:pl-8 lg:pl-10 xl:pl-12 max-w-md lg:max-w-lg xl:max-w-xl text-xl sm:text-[1.35rem] lg:text-[1.65rem] xl:text-[1.85rem] font-black text-white tracking-tight leading-[1.18] flex flex-col gap-4 sm:gap-5 lg:gap-6">
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
