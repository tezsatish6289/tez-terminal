"use client";

import {
  DAILY_LOSS_OPTIONS,
  MAX_CONCURRENT_OPTIONS,
  RISK_PER_TRADE_OPTIONS,
  type TradingPrefs,
} from "@/lib/freedombot/trading-prefs-shared";

export type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";

interface RiskControlsProps {
  values: TradingPrefs;
  onChange: (next: TradingPrefs) => void;
  disabled?: boolean;
  compact?: boolean;
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
}: RiskControlsProps) {
  const gridClass = compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-3 gap-2.5";

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
          value={values.maxConcurrentTrades}
          onChange={(e) =>
            onChange({
              ...values,
              maxConcurrentTrades: parseInt(e.target.value, 10),
            })
          }
          className="w-full rounded-xl px-2.5 py-2 text-xs font-bold outline-none"
          style={selectStyle}
        >
          {MAX_CONCURRENT_OPTIONS.map((n) => (
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
