import { AlertTriangle } from "lucide-react";

/** Repeated on every learn article — informational only, never advice. */
export function FnoNinjaLearnDisclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex gap-3 ${className}`.trim()}
      style={{
        backgroundColor: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.22)",
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
      <p className="text-[13px] sm:text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
        <span className="font-semibold text-slate-200">Informational only.</span> FNONINJA shows
        derived observations from public option-chain data. We do not recommend trades, predict
        outcomes, or tell you what to buy or sell. You are responsible for your own analysis and
        decisions.
      </p>
    </div>
  );
}
