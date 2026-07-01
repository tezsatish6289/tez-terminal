import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FB_DOC_SHELL } from "@/lib/freedombot/responsive";

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <FnoNinjaMarketTicker />

      <div className={`${FB_DOC_SHELL} py-16 sm:py-20 lg:py-24`}>
        <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] xl:text-[2.65rem] font-black text-white tracking-tight leading-[1.12] max-w-4xl flex flex-col gap-2 sm:gap-3">
          <span>
            Option chain data is powerful — but tracking hundreds of stocks is exhausting.
          </span>
          <span>We handle the data so you can focus on the opportunities.</span>
        </h2>
      </div>
    </section>
  );
}
