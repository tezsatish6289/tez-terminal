import { Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type BlockchainTradeFields = {
  txHash?: string | null;
  blockchainStatus?: string | null;
  blockchainError?: string | null;
};

export function solscanTxUrl(txHash: string): string {
  return `https://solscan.io/tx/${txHash}`;
}

/** Compact on-chain status for simulator History rows. */
export function BlockchainTxCell({
  trade,
  className,
  size = "sm",
}: {
  trade: BlockchainTradeFields;
  className?: string;
  size?: "sm" | "md";
}) {
  const text = size === "md" ? "text-[10px]" : "text-[8px]";
  const icon = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  if (trade.txHash) {
    return (
      <a
        href={solscanTxUrl(trade.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 font-bold text-purple-400 hover:text-purple-300 transition-colors",
          text,
          className,
        )}
        title="View on Solscan"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className={icon} />
        On-chain
      </a>
    );
  }

  const status = trade.blockchainStatus;
  if (status === "pending" || status === "processing") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-bold text-amber-300/80",
          text,
          className,
        )}
        title="Queued for Solana publish cron"
      >
        <Link2 className={icon} />
        Publishing…
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        className={cn(
          "inline-flex flex-col gap-0.5 font-bold text-rose-400/90 max-w-[140px]",
          text,
          className,
        )}
        title={trade.blockchainError ?? "Publish failed — cron will retry"}
      >
        <span className="inline-flex items-center gap-1">
          <Link2 className={icon} />
          Failed
        </span>
        {trade.blockchainError ? (
          <span className="font-mono font-normal text-rose-300/60 line-clamp-2">
            {trade.blockchainError}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold text-muted-foreground/45",
        text,
        className,
      )}
      title="Close recorded — blockchain-publish cron will queue this trade"
    >
      <Link2 className={icon} />
      Awaiting queue
    </span>
  );
}
