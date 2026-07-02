import { FnoNinjaLogoMark } from "@/components/fnoninja/FnoNinjaLogoMark";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

const DOES_NOT_PROVIDE = [
  "Investment advice",
  "Trading recommendations",
  "Research reports",
  "Buy/sell suggestions",
  "Stock or derivatives calls",
  "Portfolio management services",
  "Any form of personalized financial guidance",
] as const;

export function FnoNinjaDisclaimerSection() {
  return (
    <section id="disclaimer" className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,48rem)_1fr] lg:gap-8">
        <div className="min-w-0">
          <p
            className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
            style={{ color: FNO_ACCENT }}
          >
            Important Disclaimer
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-[1.12]">
            For Informational and Educational Purposes Only.
          </h2>

          <div
            className="mt-8 sm:mt-10 space-y-5 text-[13px] sm:text-sm leading-relaxed"
            style={{ color: FNO_MUTED }}
          >
            <p>
              FNONINJA is a market analytics and data visualization platform. It processes publicly
              available option chain data to generate visualizations, observations, and metrics related
              to open interest and market structure.
            </p>

            <div>
              <p className="font-medium text-white/90">FNO Ninja does not provide:</p>
              <ul className="mt-3 space-y-2 pl-0 list-none">
                {DOES_NOT_PROVIDE.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: FNO_ACCENT }}
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p>
              FNONINJA is not registered with the Securities and Exchange Board of India (SEBI) as a
              Research Analyst or Investment Adviser.
            </p>
            <p>
              Market data and derived observations may be delayed, incomplete, or inaccurate.
              Historical patterns and past observations do not guarantee or indicate future results.
              Derivatives trading carries a high risk of loss and is not suitable for all investors.
            </p>
            <p>
              Users are solely responsible for their own investment and trading decisions. You must
              conduct your own independent research and consult with a qualified financial advisor
              before making any investment or trading decision.
            </p>
          </div>

          <p
            className="mt-10 sm:mt-12 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] leading-relaxed"
            style={{ color: "#334155" }}
          >
            FNO Ninja is not affiliated with, endorsed by, or sponsored by the National Stock Exchange
            (NSE), Bombay Stock Exchange (BSE), or any other exchange or broker.
          </p>
        </div>

        <div
          className="pointer-events-none hidden items-center justify-center lg:flex"
          aria-hidden="true"
        >
          <FnoNinjaLogoMark
            size={360}
            className="h-auto w-full max-w-[360px] select-none opacity-[0.1] rounded-2xl"
          />
        </div>
      </div>
    </section>
  );
}
