import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FnoNinjaProblemChartShowcase } from "@/components/fnoninja/FnoNinjaProblemChartShowcase";
import { FB_DOC_SHELL } from "@/lib/freedombot/responsive";

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <FnoNinjaMarketTicker />

      <div className={`${FB_DOC_SHELL} py-16 sm:py-20 lg:py-24`}>
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-10 lg:gap-16 xl:gap-20 items-center">
          <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] xl:text-[2.65rem] font-black text-white tracking-tight leading-[1.12] flex flex-col gap-2 sm:gap-3">
            <span>Option chain data is powerful — but tracking hundreds of stocks is exhausting.</span>
            <span>We handle the data so you can focus on the opportunities.</span>
          </h2>

          <FnoNinjaProblemChartShowcase />
        </div>
      </div>
    </section>
  );
}
