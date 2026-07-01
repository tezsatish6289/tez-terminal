import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export function FnoNinjaComboSection() {
  return (
    <section
      id="platform-combo"
      className={`${FB_CONTENT_SHELL} py-10 sm:py-12 lg:py-16`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div className="max-w-3xl">
        <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
          FNO NINJA ={" "}
          <span style={{ color: FNO_ACCENT }}>Screener + Indicator + Option Chain Intelligence</span>
        </h2>
        <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
          One lethal combo that does the heavy lifting. It scans for stocks at key support &amp;
          resistance using real option chain data and presents everything in a clean, ready-to-use
          format — so you spend less time searching and more time trading winners.
        </p>
      </div>
    </section>
  );
}
