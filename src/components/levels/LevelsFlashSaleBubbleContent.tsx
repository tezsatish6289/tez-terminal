"use client";

import { useEffect, useState } from "react";
import { formatFlashSaleCountdown } from "@/lib/fnoninja/flash-sale";

export function LevelsFlashSaleBubbleContent({
  discountInr,
  endsAt,
  spotsLeft,
  compact,
}: {
  discountInr: number;
  endsAt: string | null;
  spotsLeft: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = formatFlashSaleCountdown(endsAt, now);
  const spotLabel =
    spotsLeft <= 0 ? "Sold out" : spotsLeft === 1 ? "1 spot left" : `${spotsLeft} spots left`;

  return (
    <div className="flex flex-col items-center justify-center px-2 text-center pointer-events-none select-none">
      <span
        className="font-black leading-none tracking-tight"
        style={{
          fontSize: compact ? 11 : 13,
          color: "#fef3c7",
          textShadow: "0 0 12px rgba(245,158,11,0.45)",
        }}
      >
        upto ₹{discountInr.toLocaleString("en-IN")}
      </span>
      <span
        className="font-semibold leading-none mt-0.5"
        style={{ fontSize: compact ? 8 : 9, color: "rgba(254,243,199,0.8)" }}
      >
        off
      </span>
      <span
        className="font-mono tabular-nums font-bold leading-none mt-1"
        style={{ fontSize: compact ? 12 : 15, color: "#fff7ed" }}
      >
        {countdown}
      </span>
      <span
        className="font-semibold leading-none mt-1.5 uppercase tracking-wide"
        style={{ fontSize: compact ? 8 : 9, color: "rgba(254,243,199,0.85)" }}
      >
        {spotLabel}
      </span>
    </div>
  );
}
