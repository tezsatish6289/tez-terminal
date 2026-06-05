"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Filter, GalleryHorizontal, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
  BLACKBOARD_FILL_ACTIVE,
  BLACKBOARD_WRAPPER,
} from "@/lib/levels/cta-blackboard";
import {
  SLIDESHOW_MAP_FILTER_KEYS,
  type SlideshowMapFilter,
} from "@/lib/zones/bubble-map-filter";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";
import type { PocDirectionFilter } from "@/lib/zones/zone-status";
import {
  LEVELS_STRIP_BOX_LABEL_CLASS,
  LEVELS_STRIP_ICON_BOX_CLASS,
  LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS,
} from "@/components/levels/levels-symbol-strip";

const FILTER_OPTIONS: {
  key: PocDirectionFilter;
  label: string;
  shortLabel: string;
  activeBorder: string;
  activeText: string;
}[] = [
  { key: "all", label: "All", shortLabel: "All", activeBorder: "rgba(226, 232, 240, 0.35)", activeText: "#e2e8f0" },
  { key: "bull", label: "At Support", shortLabel: "AtSu", activeBorder: "rgba(134, 239, 172, 0.45)", activeText: "#86efac" },
  { key: "bear", label: "At Resistance", shortLabel: "AtRe", activeBorder: "rgba(252, 165, 165, 0.45)", activeText: "#fca5a5" },
  { key: "near_bull", label: "Near Support", shortLabel: "NSup", activeBorder: "rgba(134, 239, 172, 0.35)", activeText: "#86efac" },
  { key: "near_bear", label: "Near Resistance", shortLabel: "NRes", activeBorder: "rgba(252, 165, 165, 0.35)", activeText: "#fca5a5" },
];

const MAP_FILTER_OPTIONS: {
  key: SlideshowMapFilter;
  shortLabel: string;
  activeBorder: string;
  activeText: string;
  ringStyle?: "solid" | "dotted";
}[] = [
  { key: "all", shortLabel: "All", activeBorder: "rgba(226, 232, 240, 0.35)", activeText: "#e2e8f0" },
  ...SLIDESHOW_MAP_FILTER_KEYS.map((key) => {
    const style = BUBBLE_TONE_STYLE[key];
    const isNear = key === "NEAR_BULL" || key === "NEAR_BEAR";
    const isBull = key === "IN_BULL" || key === "NEAR_BULL";
    return {
      key,
      shortLabel:
        key === "IN_BULL"
          ? "AtSu"
          : key === "NEAR_BULL"
            ? "NSup"
            : key === "IN_BEAR"
              ? "AtRe"
              : "NRes",
      activeBorder: isBull ? "rgba(134, 239, 172, 0.45)" : "rgba(252, 165, 165, 0.45)",
      activeText: isBull ? style.textColor : style.textColor,
      ringStyle: isNear ? ("dotted" as const) : ("solid" as const),
    };
  }),
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
      <circle cx="6.5" cy="10" r="3.65" />
      <circle cx="14" cy="7" r="3.1" />
      <circle cx="13.5" cy="14.5" r="2.55" />
    </svg>
  );
}

/** Pause/play inside a ring — matches transport-control convention. */
function SlideshowTransportIcon({
  mode,
  color,
  className = "h-6 w-6",
}: {
  mode: "pause" | "play";
  color: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9.25"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      {mode === "pause" ? (
        <>
          <rect x="9.15" y="8.25" width="2.35" height="7.5" rx="0.35" fill={color} />
          <rect x="12.5" y="8.25" width="2.35" height="7.5" rx="0.35" fill={color} />
        </>
      ) : (
        <path d="M10.25 8.4 L16.1 12 L10.25 15.6 Z" fill={color} />
      )}
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
        <BubblesMapIcon className="h-6 w-6" style={{ color: "#93c5fd" }} />
      ) : (
        <GalleryHorizontal className="h-5 w-5" style={{ color: BLACKBOARD_CHALK }} />
      )}
      <span
        className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase`}
        style={{ color: BLACKBOARD_CHALK_DIM }}
      >
        {toBubbles ? "Bubbles" : "Show"}
      </span>
    </button>
  );
}

function StripSearchIconBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = value.trim().length > 0;

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const label = hasQuery
    ? value.trim().length > 6
      ? `${value.trim().slice(0, 5)}…`
      : value.trim()
    : "Search";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
          style={stripIconBoxStyle(open || hasQuery)}
          aria-label={hasQuery ? `Search: ${value}` : "Search symbols"}
          title="Search symbols"
        >
          <Search
            className="h-4 w-4"
            style={{ color: hasQuery ? "#93c5fd" : BLACKBOARD_CHALK }}
          />
          <span
            className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase truncate`}
            style={{ color: hasQuery ? "#93c5fd" : BLACKBOARD_CHALK_DIM }}
          >
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto p-2 border-0 shadow-lg"
        style={{
          background: "rgba(12, 16, 26, 0.98)",
          border: BLACKBOARD_FIELD_BORDER,
        }}
      >
        <LevelsToolbarSearchInput
          value={value}
          onChange={onChange}
          inputRef={inputRef}
          className="w-[14rem] sm:w-[16rem]"
          placeholder="Symbol or name…"
        />
      </PopoverContent>
    </Popover>
  );
}

function StripMapFilterIconBox({
  filter,
  onChange,
  counts,
}: {
  filter: SlideshowMapFilter;
  onChange: (filter: SlideshowMapFilter) => void;
  counts: Record<SlideshowMapFilter, number>;
}) {
  const [open, setOpen] = useState(false);
  const activeMeta =
    MAP_FILTER_OPTIONS.find((o) => o.key === filter) ?? MAP_FILTER_OPTIONS[0];
  const filtered = filter !== "all";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
          style={stripIconBoxStyle(open || filtered)}
          aria-label={`Filter: ${filter === "all" ? "All" : BUBBLE_TONE_STYLE[filter].label}, ${counts[filter]} symbols`}
          title="Filter zone setups"
        >
          <Filter className="h-4 w-4" style={{ color: activeMeta.activeText }} />
          <span
            className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase`}
            style={{ color: filtered ? activeMeta.activeText : BLACKBOARD_CHALK_DIM }}
          >
            {activeMeta.shortLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto min-w-[12.5rem] p-1.5 border-0 shadow-lg"
        style={{
          background: "rgba(12, 16, 26, 0.98)",
          border: BLACKBOARD_FIELD_BORDER,
        }}
      >
        <p
          className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em]"
          style={{ color: "#64748b" }}
        >
          Zone filter
        </p>
        {MAP_FILTER_OPTIONS.map(({ key, activeBorder, activeText, ringStyle }) => {
          const active = filter === key;
          const label = key === "all" ? "All" : BUBBLE_TONE_STYLE[key].label;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left transition-colors"
              style={{
                background: active ? "rgba(37,99,235,0.15)" : "transparent",
                border: active
                  ? `${key === "IN_BULL" || key === "IN_BEAR" ? 2 : 1.5}px ${ringStyle ?? "solid"} ${activeBorder}`
                  : "1px solid transparent",
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
                {counts[key]}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Search · filter · play/pause · view-mode icon boxes (same height as symbol strip tiles). */
export function LevelsSlideshowStripControls({
  zoneFilter,
  onZoneFilterChange,
  filterCounts,
  search,
  mapFilter,
  slideshowControl,
  viewToggle,
  showFilter = true,
}: {
  zoneFilter: PocDirectionFilter;
  onZoneFilterChange: (filter: PocDirectionFilter) => void;
  filterCounts: Record<PocDirectionFilter, number>;
  search?: {
    value: string;
    onChange: (value: string) => void;
  };
  mapFilter?: {
    filter: SlideshowMapFilter;
    onChange: (filter: SlideshowMapFilter) => void;
    counts: Record<SlideshowMapFilter, number>;
  };
  slideshowControl?: {
    enabled: boolean;
    paused: boolean;
    onToggle: () => void;
    /** Seconds until next symbol (shown under pause). */
    secondsRemaining?: number;
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
      {search ? (
        <StripSearchIconBox value={search.value} onChange={search.onChange} />
      ) : null}

      {mapFilter ? (
        <StripMapFilterIconBox
          filter={mapFilter.filter}
          onChange={mapFilter.onChange}
          counts={mapFilter.counts}
        />
      ) : showFilter ? (
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
              className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase`}
              style={{ color: BLACKBOARD_CHALK_DIM }}
            >
              {activeMeta.shortLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto min-w-[12.5rem] p-1.5 border-0 shadow-lg"
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
          className={`${LEVELS_STRIP_ICON_BOX_CLASS} flex flex-col items-center justify-center gap-0.5 transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
          style={stripIconBoxStyle(slideshowControl.paused)}
          aria-label={
            slideshowControl.paused
              ? "Resume slideshow — 60 second countdown per symbol. Press P or click."
              : `Pause slideshow. ${Math.max(0, slideshowControl.secondsRemaining ?? 0)} seconds until next symbol. Press P or click.`
          }
          title={slideshowControl.paused ? "Play slideshow" : "Pause slideshow"}
        >
          {slideshowControl.paused ? (
            <SlideshowTransportIcon mode="play" color="#f472b6" />
          ) : (
            <SlideshowTransportIcon mode="pause" color={BLACKBOARD_CHALK} />
          )}
          <span
            className={`${LEVELS_STRIP_BOX_LABEL_CLASS} tabular-nums`}
            style={{
              color: slideshowControl.paused ? "#f472b6" : BLACKBOARD_CHALK_DIM,
            }}
            aria-live="polite"
          >
            {slideshowControl.paused
              ? "Paused"
              : `${Math.max(0, slideshowControl.secondsRemaining ?? 0)}s`}
          </span>
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
