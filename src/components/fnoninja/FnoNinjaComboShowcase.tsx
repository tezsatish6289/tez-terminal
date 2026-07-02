"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FnoNinjaLevelsPreviewCard } from "@/components/fnoninja/FnoNinjaLevelsPreviewCard";
import { FnoNinjaMarketTicker } from "@/components/fnoninja/FnoNinjaMarketTicker";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import { NIFTY_SHOWCASE_FALLBACK, type ShowcaseSymbol } from "@/lib/levels/pick-widest-cluster-symbol";
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

function itemKey(item: LevelsActionableItem): string {
  return `${item.scope}:${item.symbol}`;
}

function toTarget(item: LevelsActionableItem): ShowcaseSymbol {
  return { scope: item.scope, symbol: item.symbol, label: item.label, spreadPct: 0 };
}

interface LevelsPayload {
  inZone?: LevelsActionableItem[];
}

/**
 * Screener + chart combo: the actionable "at / near key levels" list on the
 * left, and a live chart / outlook / history preview of the selected symbol on
 * the right (auto-selects the first name). Reuses the same levels APIs that
 * power /levels.
 */
export function FnoNinjaComboShowcase() {
  const [items, setItems] = useState<LevelsActionableItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const levelsCache = useRef<Map<string, PublicLevels | null>>(new Map());

  // Load the actionable in-zone list once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
        const json = (await res.json()) as LevelsPayload;
        if (cancelled) return;
        const list = (json.inZone ?? []).filter((it) => it && it.data);
        setItems(list);
        setSelectedKey(list.length ? itemKey(list[0]) : null);
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

  const selected = useMemo(
    () => items.find((it) => itemKey(it) === selectedKey) ?? null,
    [items, selectedKey],
  );

  const target: ShowcaseSymbol | null = useMemo(() => {
    if (selected) return toTarget(selected);
    if (!listLoading && items.length === 0) return NIFTY_SHOWCASE_FALLBACK;
    return null;
  }, [selected, listLoading, items.length]);

  // Resolve full per-symbol levels for the selected target (zone overlays +
  // Outlook need the multi-expiry payload the list rows don't carry).
  useEffect(() => {
    if (!target) return;
    const key = `${target.scope}:${target.symbol}`;
    let cancelled = false;

    // Seed with the list row's bands so the chart isn't empty while we fetch.
    setLevels(selected?.data ?? null);

    if (levelsCache.current.has(key)) {
      setLevels(levelsCache.current.get(key) ?? null);
      return;
    }

    void (async () => {
      try {
        const full = await fetchSymbolLevels(target.scope, target.symbol);
        if (cancelled) return;
        levelsCache.current.set(key, full.data ?? null);
        setLevels(full.data ?? selected?.data ?? null);
      } catch {
        if (!cancelled) setLevels(selected?.data ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // selected?.data is intentionally read as a seed only; key drives refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.scope, target?.symbol]);

  const handleSelect = useCallback((key: string) => setSelectedKey(key), []);

  return (
    <div
      className="rounded-xl sm:rounded-2xl overflow-hidden flex flex-col"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      <FnoNinjaMarketTicker embedded />

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Left: actionable screener list */}
      <div
        className="lg:w-[300px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r"
        style={{ borderColor: "rgba(90,140,220,0.14)" }}
      >
        <div
          className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-b"
          style={{ borderColor: "rgba(90,140,220,0.12)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FNO_ACCENT }}>
            At / Near Key Levels
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
            {listLoading
              ? "Scanning option chains…"
              : items.length
                ? `${items.length} stock${items.length === 1 ? "" : "s"} in play`
                : "No setups right now"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[220px] lg:max-h-[440px]">
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: FNO_ACCENT }} />
              <span className="text-xs" style={{ color: "#64748b" }}>
                Loading screener…
              </span>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: "#64748b" }}>
              No stocks at key support or resistance right now. Showing Nifty 50.
            </div>
          ) : (
            <ul>
              {items.map((item) => {
                const key = itemKey(item);
                const active = key === selectedKey;
                const meta = statusMetaFor(item);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => handleSelect(key)}
                      className="w-full text-left px-3 sm:px-4 py-2.5 flex items-center gap-2 transition-colors border-l-2"
                      style={{
                        backgroundColor: active ? "rgba(96,165,250,0.12)" : "transparent",
                        borderLeftColor: active ? FNO_ACCENT : "transparent",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-bold text-[13px] truncate"
                          style={{ color: active ? "#e2e8f0" : "#cbd5e1" }}
                        >
                          {item.symbol}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: "#64748b" }}>
                          {item.label}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[12px] font-mono font-semibold" style={{ color: "#e2e8f0" }}>
                          {formatSpot(item.spot)}
                        </p>
                        <span
                          className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                          style={{ color: meta.color, backgroundColor: meta.bg }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right: live chart / outlook / history of the selected symbol */}
      <div className="flex-1 min-w-0">
        <FnoNinjaLevelsPreviewCard
          target={target}
          levels={levels}
          loading={listLoading && !target}
          bare
          className="flex flex-col h-full min-h-[320px] lg:min-h-[480px]"
        />
      </div>
      </div>
    </div>
  );
}
