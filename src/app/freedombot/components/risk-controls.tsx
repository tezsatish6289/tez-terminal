"use client";

import { useEffect } from "react";
import {
  DAILY_LOSS_OPTIONS,
  RISK_PER_TRADE_OPTIONS,
  allowedMaxConcurrentForBot,
  clampMaxConcurrentForBot,
  type TradingPrefs,
} from "@/lib/freedombot/trading-prefs-shared";

export type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";

interface RiskControlsProps {
  values: TradingPrefs;
  onChange: (next: TradingPrefs) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Bot deploy key — drives the per-bot dropdown filtering for
   *  `maxConcurrentTrades`. Crypto Bot exposes `[3, 5]`; zone bots
   *  expose the full `MAX_CONCURRENT_OPTIONS`. Defaults to "CRYPTO"
   *  because the deploy + bot-settings call sites always have a bot
   *  in context — defaulting here keeps the prop optional for any
   *  legacy caller without changing their behaviour. */
  bot?: string;
}

const selectStyle: React.CSSProperties = {
  backgroundColor: "#060d1a",
  color: "#f0f4ff",
  border: "1px solid rgba(90,140,220,0.18)",
};

function RiskField({
  label,
  compact,
  children,
}: {
  label: string;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`font-bold uppercase tracking-widest mb-1.5 ${
          compact ? "text-[9px]" : "text-[10px]"
        }`}
        style={{ color: "#475569" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export function RiskControls({
  values,
  onChange,
  disabled = false,
  compact = false,
  bot = "CRYPTO",
}: RiskControlsProps) {
  const gridClass = compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-3 gap-2.5";

  // Filter the cap dropdown to only the per-bot allowed steps. Crypto
  // Bot gets `[3, 5]`; zone bots get the full set. If the currently-
  // selected value is outside the allowed set (stale data from before
  // the bounds were introduced), snap it to the nearest allowed
  // option via the same clamp helper the server uses, so the dropdown
  // never renders a value that isn't in its options list. We also
  // render the dropdown with the clamped value directly so there's no
  // "select shows nothing, then jumps" flash before the effect fires.
  const maxConcurrentOptions = allowedMaxConcurrentForBot(bot);
  const displayMaxConcurrent = clampMaxConcurrentForBot(bot, values.maxConcurrentTrades);
  useEffect(() => {
    if (displayMaxConcurrent !== values.maxConcurrentTrades) {
      onChange({ ...values, maxConcurrentTrades: displayMaxConcurrent });
    }
  }, [displayMaxConcurrent, values, onChange]);

  return (
    <div className={gridClass}>
      <RiskField label="Risk / trade" compact={compact}>
        <select
          disabled={disabled}
          value={values.riskPerTrade}
          onChange={(e) =>
            onChange({ ...values, riskPerTrade: parseFloat(e.target.value) })
          }
          className="w-full rounded-xl px-2.5 py-2 text-xs font-bold outline-none"
          style={selectStyle}
        >
          {RISK_PER_TRADE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
      </RiskField>
      <RiskField label="Max open" compact={compact}>
        <select
          disabled={disabled}
          value={displayMaxConcurrent}
          onChange={(e) =>
            onChange({
              ...values,
              maxConcurrentTrades: parseInt(e.target.value, 10),
            })
          }
          className="w-full rounded-xl px-2.5 py-2 text-xs font-bold outline-none"
          style={selectStyle}
        >
          {maxConcurrentOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </RiskField>
      <RiskField label="Daily loss cap" compact={compact}>
        <select
          disabled={disabled}
          value={values.dailyLossLimit}
          onChange={(e) =>
            onChange({ ...values, dailyLossLimit: parseFloat(e.target.value) })
          }
          className="w-full rounded-xl px-2.5 py-2 text-xs font-bold outline-none"
          style={selectStyle}
        >
          {DAILY_LOSS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
      </RiskField>
    </div>
  );
}
