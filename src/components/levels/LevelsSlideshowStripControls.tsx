"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Filter, GalleryHorizontal, Pause, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
  BLACKBOARD_FILL_ACTIVE,
  BLACKBOARD_WRAPPER,
} from "@/lib/levels/cta-blackboard";
import type { PocDirectionFilter } from "@/lib/zones/zone-status";
import { LEVELS_STRIP_ICON_BOX_CLASS, LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS } from "@/components/levels/levels-symbol-strip";

const FILTER_OPTIONS: {
  key: PocDirectionFilter;
  label: string;
  activeBorder: string;
  activeText: string;
}[] = [
  { key: "all", label: "All", activeBorder: "rgba(226, 232, 240, 0.35)", activeText: "#e2e8f0" },
  { key: "bull", label: "Bullish", activeBorder: "rgba(134, 239, 172, 0.45)", activeText: "#86efac" },
  { key: "bear", label: "Bearish", activeBorder: "rgba(252, 165, 165, 0.45)", activeText: "#fca5a5" },
];

function stripIconBoxStyle(active?: boolean) {
  return {
    ...BLACKBOARD_WRAPPER,
    background: active ? BLACKBOARD_FILL_ACTIVE : BLACKBOARD_FIELD_BG,
    border: active ? "1px solid rgba(59, 130, 246, 0.45)" : BLACKBOARD_FIELD_BORDER,
    boxShadow: "none",
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function BubblesMapIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      style={style}
      aria-hidden
      fill="currentColor"
    >
      <circle cx="6.5" cy="10" r="3.25" />
      <circle cx="14" cy="7" r="2.75" />
      <circle cx="13.5" cy="14.5" r="2.25" />
    </svg>
  );
}

export type LevelsStripViewMode = "bubbles" | "slideshow";

/** Square box: bubbles map ↔ slideshow (dynamic icon by current mode). */
export function LevelsViewModeIconBox({
  viewMode,
  onToggle,
  title = "Press S or click",
}: {
  viewMode: LevelsStripViewMode;
  onToggle: () => void;
  title?: string;
}) {
  const toBubbles = viewMode === "slideshow";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
      style={stripIconBoxStyle(false)}
      aria-label={
        toBubbles
          ? "Switch to Market Bubbles map. Press S or click."
          : "Switch to slideshow view. Press S or click."
      }
      title={title}
    >
      {toBubbles ? (
        <BubblesMapIcon className="h-5 w-5" style={{ color: "#93c5fd" }} />
      ) : (
        <GalleryHorizontal className="h-5 w-5" style={{ color: BLACKBOARD_CHALK }} />
      )}
      <span
        className="text-[8px] font-bold uppercase tracking-wider leading-none"
        style={{ color: BLACKBOARD_CHALK_DIM }}
      >
        {toBubbles ? "Map" : "Show"}
      </span>
    </button>
  );
}

/** Filter + play/pause + view-mode icon boxes (same height as symbol strip tiles). */
export function LevelsSlideshowStripControls({
  zoneFilter,
  onZoneFilterChange,
  filterCounts,
  slideshowControl,
  viewToggle,
  showFilter = true,
}: {
  zoneFilter: PocDirectionFilter;
  onZoneFilterChange: (filter: PocDirectionFilter) => void;
  filterCounts: { all: number; bull: number; bear: number };
  slideshowControl?: {
    enabled: boolean;
    paused: boolean;
    onToggle: () => void;
  };
  viewToggle?: {
    viewMode: LevelsStripViewMode;
    onToggle: () => void;
    title?: string;
  };
  /** Bubbles toolbar: view icon only. */
  showFilter?: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const activeMeta = FILTER_OPTIONS.find((o) => o.key === zoneFilter) ?? FILTER_OPTIONS[0];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "p" || e.key === "P") {
        if (slideshowControl?.enabled) {
          e.preventDefault();
          slideshowControl.onToggle();
        }
        return;
      }
      if (e.key === "s" || e.key === "S") {
        if (viewToggle) {
          e.preventDefault();
          viewToggle.onToggle();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slideshowControl, viewToggle]);

  return (
    <div className={`flex items-stretch gap-1.5 shrink-0 ${LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS}`}>
      {showFilter ? (
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
            style={stripIconBoxStyle(filterOpen)}
            aria-label={`Filter setups: ${activeMeta.label}, ${filterCounts[zoneFilter]} symbols`}
            title="Filter aligned setups"
          >
            <Filter className="h-4 w-4" style={{ color: activeMeta.activeText }} />
            <span
              className="text-[8px] font-bold uppercase tracking-wider leading-none"
              style={{ color: BLACKBOARD_CHALK_DIM }}
            >
              {activeMeta.label.slice(0, 4)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto min-w-[10.5rem] p-1.5 border-0 shadow-lg"
          style={{
            background: "rgba(12, 16, 26, 0.98)",
            border: BLACKBOARD_FIELD_BORDER,
          }}
        >
          <p
            className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em]"
            style={{ color: "#64748b" }}
          >
            Show setups
          </p>
          {FILTER_OPTIONS.map(({ key, label, activeBorder, activeText }) => {
            const active = zoneFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onZoneFilterChange(key);
                  setFilterOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left transition-colors"
                style={{
                  background: active ? "rgba(37,99,235,0.15)" : "transparent",
                  border: active ? `1px solid ${activeBorder}` : "1px solid transparent",
                }}
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: active ? activeText : BLACKBOARD_CHALK_DIM }}
                >
                  {label}
                </span>
                <span
                  className="text-[10px] font-semibold tabular-nums"
                  style={{ color: active ? activeText : "#64748b" }}
                >
                  {filterCounts[key]}
                </span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
      ) : null}

      {slideshowControl?.enabled ? (
        <button
          type="button"
          onClick={slideshowControl.onToggle}
          className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex items-center justify-center transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
          style={stripIconBoxStyle(slideshowControl.paused)}
          aria-label={
            slideshowControl.paused
              ? "Resume auto-advancing symbols every 8 seconds. Press P or click."
              : "Pause auto-advancing symbols. Press P or click."
          }
          title={slideshowControl.paused ? "Play slideshow" : "Pause slideshow"}
        >
          {slideshowControl.paused ? (
            <Play className="h-5 w-5 fill-current" style={{ color: "#f472b6" }} />
          ) : (
            <Pause className="h-5 w-5" style={{ color: BLACKBOARD_CHALK }} />
          )}
        </button>
      ) : null}

      {viewToggle ? (
        <LevelsViewModeIconBox
          viewMode={viewToggle.viewMode}
          onToggle={viewToggle.onToggle}
          title={viewToggle.title}
        />
      ) : null}
    </div>
  );
}
