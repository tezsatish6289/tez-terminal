import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import { FB_DOC_SHELL } from "@/lib/freedombot/responsive";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaProblemSection() {
  return (
    <section className="border-b" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
      <FnoNinjaMarketTicker />

      <div className={`${FB_DOC_SHELL} py-16 sm:py-20 lg:py-24`}>
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-10 lg:gap-16 xl:gap-20 items-start">
          <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] xl:text-[2.65rem] font-black text-white tracking-tight leading-[1.12]">
            Option chain data is powerful — but tracking it across hundreds of stocks is
            overwhelming.
          </h2>

          <div
            className="flex flex-col gap-4 text-base sm:text-lg leading-relaxed lg:pt-1 max-w-xl lg:max-w-none lg:justify-self-end"
            style={{ color: FNO_MUTED }}
          >
            <p>
              FNONINJA turns complex option chain data into clear visual market maps. Spot open
              interest clusters, key zones, and market structure at a glance — all in one interface.
            </p>
            <p>
              Instead of manually reviewing individual option chains, you can monitor broader market
              structure from a single interface — for your own independent research.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
