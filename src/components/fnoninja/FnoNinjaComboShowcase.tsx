"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import {
  bandsFromLevels,
  type LevelsActionableItem,
} from "@/lib/zones/levels-actionable-list";
import { zoneStatusDisplayKey, type ZoneDisplayKey } from "@/lib/zones/zone-status";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

type StatusMeta = { label: string; color: string; bg: string };

const STATUS_META: Record<ZoneDisplayKey, StatusMeta> = {
  IN_BULL: { label: "At Support", color: "#34d399", bg: "rgba(52,211,153,0.14)" },
  IN_BEAR: { label: "At Resistance", color: "#fb7185", bg: "rgba(251,113,133,0.14)" },
  NEAR_BULL: { label: "Near Support", color: "#6ee7b7", bg: "rgba(52,211,153,0.10)" },
  NEAR_BEAR: { label: "Near Resistance", color: "#fda4af", bg: "rgba(251,113,133,0.10)" },
  NEUTRAL: { label: "Watching", color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
  ILLIQUID: { label: "Watching", color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
};

function statusMetaFor(item: LevelsActionableItem): StatusMeta {
  const key = zoneStatusDisplayKey(bandsFromLevels(item.data, item.spot));
  return STATUS_META[key] ?? STATUS_META.NEUTRAL;
}

function formatSpot(spot: number | null): string {
  if (spot == null || !Number.isFinite(spot)) return "—";
  return `₹${spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

interface LevelsPayload {
  inZone?: LevelsActionableItem[];
}

/** Live screener list — stocks at or near key OI levels (no embedded chart). */
export function FnoNinjaComboShowcase() {
  const [items, setItems] = useState<LevelsActionableItem[]>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
        const json = (await res.json()) as LevelsPayload;
        if (cancelled) return;
        setItems((json.inZone ?? []).filter((it) => it && it.data));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-xl sm:rounded-2xl"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      <FnoNinjaMarketTicker embedded />

      <div
        className="shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3"
        style={{ borderColor: "rgba(90,140,220,0.12)" }}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FNO_ACCENT }}>
          At / Near Key Levels
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: "#64748b" }}>
          {listLoading
            ? "Scanning option chains…"
            : items.length
              ? `${items.length} stock${items.length === 1 ? "" : "s"} in play`
              : "No setups right now"}
        </p>
      </div>

      <div className="max-h-[min(52vh,420px)] overflow-y-auto sm:max-h-[480px]">
        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: FNO_ACCENT }} />
            <span className="text-xs" style={{ color: "#64748b" }}>
              Loading screener…
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs" style={{ color: "#64748b" }}>
            No stocks at key support or resistance right now.
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              const meta = statusMetaFor(item);
              return (
                <li
                  key={`${item.scope}:${item.symbol}`}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "rgba(90,140,220,0.08)" }}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[#e2e8f0]">{item.symbol}</p>
                      <p className="truncate text-[10px]" style={{ color: "#64748b" }}>
                        {item.label}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[12px] font-semibold text-[#e2e8f0]">
                        {formatSpot(item.spot)}
                      </p>
                      <span
                        className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
