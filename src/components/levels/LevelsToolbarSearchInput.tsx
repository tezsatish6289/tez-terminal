"use client";

import type { FocusEventHandler, KeyboardEventHandler, RefObject } from "react";
import { Search } from "lucide-react";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
} from "@/lib/levels/cta-blackboard";

export function LevelsToolbarSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  inputRef,
  onKeyDown,
  onFocus,
  onBlur,
  ariaLabel = "Search symbols",
  layout = "compact",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  ariaLabel?: string;
  /** Nav bar: full-width pill; compact: fixed-width toolbar chip. */
  layout?: "compact" | "bar";
}) {
  const isBar = layout === "bar";
  return (
    <div
      className={
        isBar
          ? `relative shrink-0 w-full min-w-0 ${className}`.trim()
          : `relative shrink-0 w-[10.5rem] sm:w-[12rem] min-w-[9rem] ${className}`.trim()
      }
    >
      <Search
        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${
          isBar ? "left-2.5 h-3.5 w-3.5" : "left-2.5 h-3.5 w-3.5"
        }`}
        style={{ color: BLACKBOARD_CHALK_DIM }}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`w-full outline-none placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-slate-400/25 ${
          isBar
            ? "h-8 pl-8 pr-2.5 rounded-full text-[11px] font-normal tracking-normal placeholder:font-normal placeholder:text-slate-500"
            : `pl-8 pr-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full text-[9px] font-bold uppercase tracking-wide placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal`
        }`}
        style={{
          backgroundColor: isBar ? "rgba(255,255,255,0.03)" : BLACKBOARD_FIELD_BG,
          border: isBar ? "1px solid rgba(255,255,255,0.08)" : BLACKBOARD_FIELD_BORDER,
          color: BLACKBOARD_CHALK,
        }}
      />
    </div>
  );
}
