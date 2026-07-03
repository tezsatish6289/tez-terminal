import { FnoNinjaLogoMark } from "@/components/fnoninja/FnoNinjaLogoMark";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

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
    <section id="disclaimer" className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="max-w-3xl">
        <SectionEyebrow>Important Disclaimer</SectionEyebrow>
        <h2 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-[1.12]">
          For informational and <GradientText>educational purposes</GradientText> only.
        </h2>
      </div>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div
          className="rounded-xl border p-6 sm:p-7 text-[13px] sm:text-sm leading-relaxed text-slate-400"
          style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}
        >
          <p>
            FNONINJA is a market analytics and data visualization platform. It processes publicly
            available option chain data to generate visualizations, observations, and metrics related
            to open interest and market structure.
          </p>

          <p className="mt-4">
            FNONINJA is <span className="text-white">not registered</span> with the Securities and
            Exchange Board of India (SEBI) as a Research Analyst or Investment Adviser.
          </p>

          <p className="mt-4">
            Market data and derived observations may be delayed, incomplete, or inaccurate.
            Historical patterns and past observations do not guarantee or indicate future results.
            Derivatives trading carries a high risk of loss and is not suitable for all investors.
          </p>
          <p className="mt-4">
            Users are solely responsible for their own investment and trading decisions. You must
            conduct your own independent research and consult with a qualified financial advisor
            before making any investment or trading decision.
          </p>
        </div>

        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "rgba(244,63,94,0.28)", backgroundColor: "rgba(244,63,94,0.06)" }}
        >
          <p className="text-[11px] uppercase tracking-wider text-rose-300">FNO Ninja does not provide</p>
          <ul className="mt-4 space-y-2 text-sm">
            {DOES_NOT_PROVIDE.map((item) => (
              <li key={item} className="flex items-start gap-2 text-slate-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p
        className="mt-8 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] leading-relaxed"
        style={{ color: "#334155" }}
      >
        FNO Ninja is not affiliated with, endorsed by, or sponsored by the National Stock Exchange
        (NSE), Bombay Stock Exchange (BSE), or any other exchange or broker.
      </p>

      <div
        className="pointer-events-none hidden items-center justify-center lg:flex mt-10"
        aria-hidden="true"
      >
        <FnoNinjaLogoMark
          size={320}
          className="h-auto w-full max-w-[320px] select-none opacity-[0.08] rounded-2xl"
        />
      </div>
    </section>
  );
}
