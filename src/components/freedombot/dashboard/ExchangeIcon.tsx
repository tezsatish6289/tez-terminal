"use client";

import Image from "next/image";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";

const EXCHANGE_LOGOS: Record<string, string> = {
  BYBIT: "/freedombot/exchanges/bybit.png",
  COINDCX: "/freedombot/exchanges/coindcx.png",
  HYPERLIQUID: "/freedombot/exchanges/hyperliquid.png",
};

export function ExchangeIcon({
  exchange,
  size = 28,
  className,
}: {
  exchange: string;
  size?: number;
  className?: string;
}) {
  const logo = EXCHANGE_LOGOS[exchange];
  if (logo) {
    return (
      <Image
        src={logo}
        alt={exchangeLabel(exchange)}
        width={size}
        height={size}
        className={className ?? "rounded-full object-contain"}
      />
    );
  }

  const label = exchangeLabel(exchange);
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={className ?? "inline-flex items-center justify-center rounded-full font-black uppercase"}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.32),
        backgroundColor: "rgba(96,165,250,0.12)",
        color: "#93c5fd",
        border: "1px solid rgba(96,165,250,0.2)",
      }}
      title={label}
    >
      {initials}
    </span>
  );
}
