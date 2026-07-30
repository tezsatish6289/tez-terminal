"use client";

/** Compact gold-coin content for the Refer & Earn map bubble. */
export function LevelsAffiliateBubbleContent({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-1.5 text-center pointer-events-none select-none">
      <span
        aria-hidden
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: compact ? 18 : 22,
          height: compact ? 18 : 22,
          background:
            "radial-gradient(circle at 35% 30%, #fde68a 0%, #f59e0b 42%, #b45309 78%, #78350f 100%)",
          boxShadow:
            "0 0 10px rgba(245,158,11,0.5), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(120,53,15,0.4)",
          border: "1px solid rgba(253,230,138,0.85)",
        }}
      >
        <span
          className="font-black leading-none"
          style={{
            fontSize: compact ? 10 : 12,
            color: "#78350f",
            textShadow: "0 1px 0 rgba(254,243,199,0.55)",
          }}
        >
          ₹
        </span>
      </span>
      <span
        className="font-black leading-none tracking-wide uppercase mt-0.5"
        style={{
          fontSize: compact ? 8 : 9,
          color: "#fef3c7",
          textShadow: "0 0 8px rgba(245,158,11,0.45)",
        }}
      >
        Earn
      </span>
      <span
        className="font-black leading-none mt-0.5 tabular-nums"
        style={{
          fontSize: compact ? 10 : 12,
          color: "#fde68a",
          textShadow: "0 0 10px rgba(251,191,36,0.55)",
        }}
      >
        30%
      </span>
    </div>
  );
}
