"use client";

import type { PublicBotApiRow } from "@/hooks/use-public-bots";
import { BotIcon } from "@/components/freedombot/dashboard/BotDiscoverySection";
import { ExchangeIcon } from "@/components/freedombot/dashboard/ExchangeIcon";

/** Bot + exchange logos stacked for running-bot cards. */
export function BotExchangeIcons({
  bot,
  exchange,
  size = 36,
}: {
  bot: PublicBotApiRow;
  exchange: string;
  size?: number;
}) {
  const exchangeSize = Math.round(size * 0.58);

  return (
    <div className="relative flex-shrink-0" style={{ width: size + exchangeSize * 0.35, height: size }}>
      <div
        className="absolute left-0 top-0 rounded-full flex items-center justify-center"
        style={{
          width: size,
          height: size,
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(90,140,220,0.15)",
        }}
      >
        <BotIcon bot={bot} size={Math.round(size * 0.55)} />
      </div>
      <div
        className="absolute bottom-0 rounded-full flex items-center justify-center overflow-hidden"
        style={{
          left: size - exchangeSize * 0.45,
          width: exchangeSize,
          height: exchangeSize,
          backgroundColor: "#0c1a30",
          border: "2px solid #0c1a30",
          boxShadow: "0 0 0 1px rgba(90,140,220,0.2)",
        }}
      >
        <ExchangeIcon exchange={exchange} size={exchangeSize - 4} />
      </div>
    </div>
  );
}
