import { AlertTriangle } from "lucide-react";

export const SCIENCE_LEARN_DISCLAIMER: string[] = [
  "FNO Ninja visualizes observations derived from publicly available NSE option-chain data.",
  "The platform does not provide investment advice, recommendations, predictions, buy signals, or sell signals.",
  "Put Clusters, Call Clusters, Max Pain, and other zones are informational reference points designed to help traders understand where option positioning and hedging activity are concentrated.",
  "Always perform your own analysis and manage your own risk before making any trading or investment decision.",
];

/** Repeated on learn articles — informational only, never advice. */
export function FnoNinjaLearnDisclaimer({
  className = "",
  title = "Disclaimer",
  paragraphs,
}: {
  className?: string;
  title?: string;
  paragraphs?: string[];
}) {
  const body = paragraphs ?? [
    "FNONINJA shows derived observations from public option-chain data. We do not recommend trades, predict outcomes, or tell you what to buy or sell. You are responsible for your own analysis and decisions.",
  ];

  return (
    <div
      className={`rounded-xl px-4 py-4 sm:px-5 sm:py-5 flex gap-3 ${className}`.trim()}
      style={{
        backgroundColor: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.22)",
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-1" style={{ color: "#fbbf24" }} />
      <div className="space-y-3 min-w-0">
        <p className="text-sm font-bold text-slate-200">{title}</p>
        {body.map((p) => (
          <p key={p} className="text-[13px] sm:text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
