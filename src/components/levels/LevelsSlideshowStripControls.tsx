"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Filter, Star } from "lucide-react";
import {
  FNO_FAVSLIDE_ACCENT,
  FNO_LIVESLIDE_ACCENT,
} from "@/lib/fnoninja/theme";
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
  LEVELS_STRIP_ICON_INNER_CLASS,
  LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS,
  LEVELS_RAIL_CONTROL_BOX_CLASS,
  LEVELS_RAIL_CONTROL_INNER_CLASS,
  LEVELS_RAIL_CONTROL_LABEL_CLASS,
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

import { SlideshowTransportIcon } from "@/components/levels/SlideshowTransportIcon";

export type LevelsStripViewMode = "bubbles" | "liveslide" | "favslide";

const SLIDE_MODE_ACCENT: Record<"liveslide" | "favslide", { color: string; border: string }> = {
  liveslide: { color: FNO_LIVESLIDE_ACCENT, border: "rgba(96,165,250,0.45)" },
  favslide: { color: FNO_FAVSLIDE_ACCENT, border: "rgba(251,191,36,0.45)" },
};

/** Persistent pill — which slideshow mode is active. */
export function LevelsSlideModePill({
  mode,
  count,
  boxClassName = LEVELS_STRIP_ICON_BOX_CLASS,
  inline = false,
}: {
  mode: "liveslide" | "favslide";
  count?: number;
  boxClassName?: string;
  inline?: boolean;
}) {
  const isFav = mode === "favslide";
  const accent = SLIDE_MODE_ACCENT[mode];
  const innerClass = inline ? LEVELS_RAIL_CONTROL_INNER_CLASS : LEVELS_STRIP_ICON_INNER_CLASS;
  const labelClass = inline ? LEVELS_RAIL_CONTROL_LABEL_CLASS : LEVELS_STRIP_BOX_LABEL_CLASS;
  return (
    <span
      className={`${boxClassName} ${innerClass} shrink-0 cursor-default select-none`}
      style={{
        ...BLACKBOARD_WRAPPER,
        background: isFav ? "rgba(251,191,36,0.1)" : "rgba(37,99,235,0.1)",
        border: `1px solid ${accent.border}`,
        boxShadow: "none",
      }}
      data-liveslide-tour={isFav ? undefined : "live-count"}
      data-favslide-tour={isFav ? "fav-count" : undefined}
      aria-label={
        isFav
          ? `Favslide${count != null ? `, ${count} stocks` : ""}`
          : `Liveslide${count != null ? `, ${count} setups` : ", aligned market setups"}`
      }
    >
      {isFav ? (
        <Star className="h-3.5 w-3.5 shrink-0" style={{ color: accent.color }} fill={accent.color} strokeWidth={2} />
      ) : (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: accent.color, boxShadow: `0 0 6px ${accent.color}` }}
        />
      )}
      <span
        className={`${labelClass}${inline ? "" : " uppercase font-black tracking-[0.12em]"}`}
        style={{ color: accent.color }}
      >
        {isFav
          ? count != null
            ? `Fav · ${count}`
            : "Favslide"
          : count != null
            ? `Live · ${count}`
            : "Live"}
      </span>
    </span>
  );
}

type StripDestination = "bubbles" | "liveslide" | "favslide";

const DESTINATION_ACCENT: Record<
  StripDestination,
  { color: string; label: string; border: string; bg: string; hoverBorder: string }
> = {
  bubbles: {
    color: "#94a3b8",
    label: "Bubbles",
    border: "rgba(148, 163, 184, 0.22)",
    bg: "rgba(22, 28, 42, 0.92)",
    hoverBorder: "rgba(148, 163, 184, 0.38)",
  },
  liveslide: {
    color: FNO_LIVESLIDE_ACCENT,
    label: "Live",
    border: "rgba(96, 165, 250, 0.32)",
    bg: "rgba(37, 99, 235, 0.1)",
    hoverBorder: "rgba(96, 165, 250, 0.5)",
  },
  favslide: {
    color: FNO_FAVSLIDE_ACCENT,
    label: "Fav",
    border: "rgba(251, 191, 36, 0.32)",
    bg: "rgba(251, 191, 36, 0.08)",
    hoverBorder: "rgba(251, 191, 36, 0.5)",
  },
};

function StripDestinationIcon({
  destination,
  color,
}: {
  destination: StripDestination;
  color: string;
}) {
  if (destination === "bubbles") {
    return <BubblesMapIcon className="h-[1.35rem] w-[1.35rem] md:h-6 md:w-6" style={{ color }} />;
  }
  if (destination === "favslide") {
    return <Star className="h-4 w-4 md:h-[1.125rem] md:w-[1.125rem]" style={{ color }} strokeWidth={2} />;
  }
  return (
    <span
      className="relative flex h-4 w-4 md:h-[1.125rem] md:w-[1.125rem] items-center justify-center"
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          border: `1.5px solid ${color}`,
          opacity: 0.55,
        }}
      />
      <span
        className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}

/** Tiny corner hint that the tile switches view (not overlaid on the main icon). */
function StripSwitchHint({ color }: { color: string }) {
  return (
    <span
      className="absolute top-1 right-1 flex h-3.5 w-3.5 md:h-4 md:w-4 items-center justify-center rounded-[4px] pointer-events-none"
      style={{
        background: "rgba(8, 12, 20, 0.82)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      aria-hidden
    >
      <ArrowUpRight className="h-2 w-2 md:h-2.5 md:w-2.5" style={{ color }} strokeWidth={2.5} />
    </span>
  );
}

/** One tile in the paired view switcher. */
function StripDestinationSwitchBox({
  destination,
  onClick,
  title,
  tourAttrs,
}: {
  destination: StripDestination;
  onClick: () => void;
  title: string;
  tourAttrs?: Record<string, string | undefined>;
}) {
  const accent = DESTINATION_ACCENT[destination];
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative ${LEVELS_STRIP_ICON_BOX_CLASS} ${LEVELS_STRIP_ICON_INNER_CLASS} rounded-lg transition-all active:scale-[0.98]`}
      style={{
        ...BLACKBOARD_WRAPPER,
        background: accent.bg,
        border: `1px solid ${hovered ? accent.hoverBorder : accent.border}`,
        boxShadow: hovered ? `0 0 0 1px ${accent.border}` : "none",
      }}
      aria-label={title}
      title={title}
      {...tourAttrs}
    >
      <StripSwitchHint color={accent.color} />
      <StripDestinationIcon destination={destination} color={accent.color} />
      <span
        className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase tracking-[0.06em]`}
        style={{ color: accent.color }}
      >
        {accent.label}
      </span>
    </button>
  );
}

/** Adjacent switch targets: Bubbles + the other slideshow mode. */
export function LevelsSlideViewSwitchGroup({
  onBubbles,
  bubblesTitle = "Back to Market Bubbles map. Press B or click.",
  alternateMode,
  onAlternate,
  alternateTitle,
}: {
  currentMode: "liveslide" | "favslide";
  onBubbles: () => void;
  bubblesTitle?: string;
  alternateMode?: "liveslide" | "favslide";
  onAlternate?: () => void;
  alternateTitle?: string;
}) {
  const paired = alternateMode != null && onAlternate != null;

  if (!paired) {
    return (
      <StripDestinationSwitchBox
        destination="bubbles"
        onClick={onBubbles}
        title={bubblesTitle}
        tourAttrs={{
          "data-liveslide-tour": "bubbles",
          "data-favslide-tour": "bubbles",
        }}
      />
    );
  }

  const altDefaultTitle =
    alternateMode === "favslide"
      ? "Switch to favslide. Press F or click."
      : "Switch to liveslide. Press L or click.";

  return (
    <div
      className="flex items-stretch gap-1.5 shrink-0"
      role="group"
      aria-label="Switch view"
    >
      <StripDestinationSwitchBox
        destination="bubbles"
        onClick={onBubbles}
        title={bubblesTitle}
        tourAttrs={{
          "data-liveslide-tour": "bubbles",
          "data-favslide-tour": "bubbles",
        }}
      />
      <StripDestinationSwitchBox
        destination={alternateMode}
        onClick={onAlternate}
        title={alternateTitle ?? altDefaultTitle}
        tourAttrs={{
          "data-liveslide-tour": alternateMode === "liveslide" ? "live-switch" : undefined,
          "data-favslide-tour": alternateMode === "favslide" ? "fav-switch" : undefined,
        }}
      />
    </div>
  );
}

/** Square box: return to bubbles map from slideshow. */

function StripSearchBar({
  value,
  onChange,
  iconBoxClass = LEVELS_STRIP_ICON_BOX_CLASS,
}: {
  value: string;
  onChange: (value: string) => void;
  iconBoxClass?: string;
}) {
  const isRail = iconBoxClass === LEVELS_RAIL_CONTROL_BOX_CLASS;

  return (
    <div className={isRail ? "w-full min-w-0" : "shrink-0 min-w-[10rem] sm:min-w-[12rem]"}>
      <LevelsToolbarSearchInput
        value={value}
        onChange={onChange}
        layout="bar"
        placeholder="Search symbol…"
        ariaLabel="Search symbols"
        className={isRail ? "w-full" : "min-w-[10rem] sm:min-w-[12rem]"}
      />
    </div>
  );
}

function StripMapFilterIconBox({
  filter,
  onChange,
  counts,
  slideAccent,
  stripMode,
  iconBoxClass = LEVELS_STRIP_ICON_BOX_CLASS,
  iconInnerClass = LEVELS_STRIP_ICON_INNER_CLASS,
  labelClass = LEVELS_STRIP_BOX_LABEL_CLASS,
  listCount,
}: {
  filter: SlideshowMapFilter;
  onChange: (filter: SlideshowMapFilter) => void;
  counts: Record<SlideshowMapFilter, number>;
  slideAccent?: { color: string; border: string } | null;
  stripMode?: "liveslide" | "favslide";
  iconBoxClass?: string;
  iconInnerClass?: string;
  labelClass?: string;
  /** Slideshow list size — shown beside filter label in one box. */
  listCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const activeMeta =
    MAP_FILTER_OPTIONS.find((o) => o.key === filter) ?? MAP_FILTER_OPTIONS[0];
  const filtered = filter !== "all";
  const subtleRail = listCount != null;
  const iconColor = subtleRail
    ? "rgba(96,165,250,0.55)"
    : slideAccent?.color ?? activeMeta.activeText;
  const labelColor = subtleRail
    ? "#94a3b8"
    : slideAccent?.color ?? (filtered ? activeMeta.activeText : BLACKBOARD_CHALK_DIM);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${iconBoxClass} ${iconInnerClass} transition-colors hover:border-slate-400/30 active:scale-[0.98]`}
          style={{
            ...stripIconBoxStyle(open || filtered),
            ...(slideAccent && !subtleRail
              ? {
                  border: `1px solid ${slideAccent.border}`,
                  background:
                    stripMode === "liveslide"
                      ? "rgba(37,99,235,0.1)"
                      : "rgba(251,191,36,0.1)",
                }
              : {}),
            ...(subtleRail
              ? {
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }
              : {}),
          }}
          aria-label={`Filter: ${filter === "all" ? "All" : BUBBLE_TONE_STYLE[filter].label}, ${counts[filter]} symbols${listCount != null ? `, ${listCount} in slideshow` : ""}`}
          title="Filter zone setups"
          data-liveslide-tour="filter"
        >
          <Filter className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />
          <span
            className={`${labelClass} uppercase tabular-nums${listCount != null ? " truncate" : ""}`}
            style={{ color: labelColor }}
          >
            {activeMeta.shortLabel}
            {listCount != null ? ` · ${listCount}` : ""}
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
  viewSwitchGroup,
  slideModePill,
  showFilter = true,
  stripTrailing,
  className = "",
  orientation = "horizontal",
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
    /** Why the timer is held (Atlas, Intraday, etc.). */
    pauseReason?: string | null;
    /** False when auto-pause cannot be cleared from the transport button (Atlas open). */
    canResume?: boolean;
  };
  viewToggle?: {
    viewMode: LevelsStripViewMode;
    onToggle: () => void;
    title?: string;
  };
  /** Paired Bubbles + Live/Fav switch boxes (slideshow strip). */
  viewSwitchGroup?: {
    currentMode: "liveslide" | "favslide";
    onBubbles: () => void;
    bubblesTitle?: string;
    alternateMode?: "liveslide" | "favslide";
    onAlternate?: () => void;
    alternateTitle?: string;
  };
  slideModePill?: {
    mode: LevelsStripViewMode;
    count?: number;
  };
  /** Bubbles toolbar: view icon only. */
  showFilter?: boolean;
  /** Extra icon boxes after Bubbles (e.g. favslide add). */
  stripTrailing?: React.ReactNode;
  className?: string;
  /** Stack control tiles vertically in the symbol rail. */
  orientation?: "horizontal" | "vertical";
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const isVertical = orientation === "vertical";
  const iconBoxClass = isVertical ? LEVELS_RAIL_CONTROL_BOX_CLASS : LEVELS_STRIP_ICON_BOX_CLASS;
  const iconInnerClass = isVertical ? LEVELS_RAIL_CONTROL_INNER_CLASS : LEVELS_STRIP_ICON_INNER_CLASS;
  const labelClass = isVertical ? LEVELS_RAIL_CONTROL_LABEL_CLASS : LEVELS_STRIP_BOX_LABEL_CLASS;
  const activeMeta = FILTER_OPTIONS.find((o) => o.key === zoneFilter) ?? FILTER_OPTIONS[0];
  const stripMode = slideModePill?.mode ?? viewToggle?.viewMode;
  const slideAccent =
    stripMode === "liveslide"
      ? SLIDE_MODE_ACCENT.liveslide
      : stripMode === "favslide"
        ? SLIDE_MODE_ACCENT.favslide
        : null;

  const liveFilterWithCount =
    Boolean(mapFilter) &&
    slideModePill?.mode === "liveslide" &&
    slideModePill.count != null;
  const favAddWithCount =
    slideModePill?.mode === "favslide" && stripTrailing != null;
  const showSlideModePill =
    slideModePill &&
    (slideModePill.mode === "liveslide" || slideModePill.mode === "favslide") &&
    !liveFilterWithCount &&
    !favAddWithCount;

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
      if (e.key === "b" || e.key === "B") {
        if (viewSwitchGroup) {
          e.preventDefault();
          viewSwitchGroup.onBubbles();
        } else if (viewToggle) {
          e.preventDefault();
          viewToggle.onToggle();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slideshowControl, viewToggle, viewSwitchGroup]);

  return (
    <div
      className={`flex gap-1.5 shrink-0 ${
        isVertical
          ? "flex-col w-full gap-1"
          : `flex-row items-stretch ${LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS}`
      } ${className}`.trim()}
    >
      {search ? (
        <StripSearchBar
          value={search.value}
          onChange={search.onChange}
          iconBoxClass={iconBoxClass}
        />
      ) : null}

      {mapFilter ? (
        <StripMapFilterIconBox
          filter={mapFilter.filter}
          onChange={mapFilter.onChange}
          counts={mapFilter.counts}
          slideAccent={slideAccent}
          stripMode={stripMode === "liveslide" || stripMode === "favslide" ? stripMode : undefined}
          iconBoxClass={iconBoxClass}
          iconInnerClass={iconInnerClass}
          labelClass={labelClass}
          listCount={liveFilterWithCount ? slideModePill?.count : undefined}
        />
      ) : showFilter ? (
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`${iconBoxClass} ${iconInnerClass} transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
            style={{
              ...stripIconBoxStyle(filterOpen),
              ...(slideAccent
                ? {
                    border: `1px solid ${slideAccent.border}`,
                    background:
                      stripMode === "liveslide"
                        ? "rgba(37,99,235,0.1)"
                        : "rgba(251,191,36,0.1)",
                  }
                : {}),
            }}
            aria-label={`Filter setups: ${activeMeta.label}, ${filterCounts[zoneFilter]} symbols`}
            title="Filter aligned setups"
            data-liveslide-tour="filter"
          >
            <Filter
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: slideAccent?.color ?? activeMeta.activeText }}
            />
            <span
              className={`${labelClass} uppercase`}
              style={{ color: slideAccent?.color ?? BLACKBOARD_CHALK_DIM }}
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

      {showSlideModePill ? (
        <LevelsSlideModePill
          mode={slideModePill!.mode as "liveslide" | "favslide"}
          count={slideModePill!.count}
          boxClassName={iconBoxClass}
          inline={isVertical}
        />
      ) : null}

      {slideshowControl?.enabled ? (
        <button
          type="button"
          onClick={slideshowControl.onToggle}
          disabled={slideshowControl.paused && slideshowControl.canResume === false}
          className={`${iconBoxClass} ${iconInnerClass} transition-colors hover:border-slate-400/40 active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed`}
          style={{
            ...stripIconBoxStyle(slideshowControl.paused),
            ...(slideAccent && !slideshowControl.paused
              ? {
                  border: `1px solid ${slideAccent.border}`,
                  background:
                    stripMode === "liveslide"
                      ? "rgba(37,99,235,0.1)"
                      : "rgba(251,191,36,0.1)",
                }
              : {}),
            ...(slideshowControl.paused && slideshowControl.pauseReason
              ? {
                  border: "1px solid rgba(244,114,182,0.35)",
                  background: "rgba(244,114,182,0.08)",
                }
              : {}),
          }}
          aria-label={
            slideshowControl.paused
              ? slideshowControl.pauseReason
                ? `Slideshow paused while viewing ${slideshowControl.pauseReason}. ${slideshowControl.canResume === false ? "Close Atlas to resume." : "Press P or click to return to Trend Chart."}`
                : "Resume slideshow — 60 second countdown per symbol. Press P or click."
              : `Pause slideshow. ${Math.max(0, slideshowControl.secondsRemaining ?? 0)} seconds until next symbol. Press P or click.`
          }
          title={
            slideshowControl.paused
              ? slideshowControl.pauseReason
                ? slideshowControl.canResume === false
                  ? "Paused — close Atlas to resume"
                  : "Paused — return to Trend Chart"
                : "Play slideshow"
              : "Pause slideshow"
          }
          data-liveslide-tour="pause"
          data-favslide-tour="pause"
        >
          {slideshowControl.paused ? (
            <SlideshowTransportIcon mode="play" color="#f472b6" className={isVertical ? "h-4 w-4" : "h-6 w-6"} />
          ) : (
            <SlideshowTransportIcon
              mode="pause"
              color={slideAccent?.color ?? BLACKBOARD_CHALK}
              className={isVertical ? "h-4 w-4" : "h-6 w-6"}
            />
          )}
          <span
            className={`${labelClass} tabular-nums leading-tight${isVertical ? " truncate" : ""}`}
            style={{
              color: slideshowControl.paused
                ? "#f472b6"
                : slideAccent?.color ?? BLACKBOARD_CHALK_DIM,
            }}
            aria-live="polite"
          >
            {slideshowControl.paused
              ? slideshowControl.pauseReason
                ? `Paused · ${slideshowControl.pauseReason}`
                : "Paused"
              : `${Math.max(0, slideshowControl.secondsRemaining ?? 0)}s`}
          </span>
        </button>
      ) : null}

      {viewSwitchGroup ? (
        <LevelsSlideViewSwitchGroup
          currentMode={viewSwitchGroup.currentMode}
          onBubbles={viewSwitchGroup.onBubbles}
          bubblesTitle={viewSwitchGroup.bubblesTitle}
          alternateMode={viewSwitchGroup.alternateMode}
          onAlternate={viewSwitchGroup.onAlternate}
          alternateTitle={viewSwitchGroup.alternateTitle}
        />
      ) : viewToggle ? (
        <LevelsSlideViewSwitchGroup
          currentMode={
            viewToggle.viewMode === "favslide"
              ? "favslide"
              : viewToggle.viewMode === "liveslide"
                ? "liveslide"
                : "liveslide"
          }
          onBubbles={viewToggle.onToggle}
          bubblesTitle={viewToggle.title}
        />
      ) : null}

      {stripTrailing}
    </div>
  );
}
