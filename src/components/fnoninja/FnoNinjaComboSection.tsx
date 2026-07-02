import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FnoNinjaComboShowcase } from "@/components/fnoninja/FnoNinjaComboShowcase";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaComboSection() {
  return (
    <section
      id="platform-combo"
      className="border-b"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className={`${FNO_LANDING_SHELL} pt-16 sm:pt-20 lg:pt-24 pb-20 sm:pb-24 lg:pb-32`}>
        <div className="max-w-3xl mb-8 sm:mb-10 lg:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] font-black tracking-tight leading-[1.12]">
            <span className="text-[#f0f4ff]">FNO</span>
            <span style={{ color: FNO_ACCENT }}>NINJA</span>
            {" = "}
            <span className="text-[#f0f4ff]">Screener + Indicator</span>
          </h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
            We handle the data and do the heavy lifting so you can focus on finding a fitting trade.
          </p>
        </div>

        <FnoNinjaComboShowcase />
      </div>
    </section>
  );
}
