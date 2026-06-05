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
}) {
  return (
    <div className={`relative shrink-0 w-[10.5rem] sm:w-[12rem] min-w-[9rem] ${className}`.trim()}>
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
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
        className={`w-full pl-8 pr-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full text-[9px] font-bold uppercase tracking-wide outline-none placeholder:text-slate-500 placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal focus-visible:ring-1 focus-visible:ring-slate-400/30`}
        style={{
          backgroundColor: BLACKBOARD_FIELD_BG,
          border: BLACKBOARD_FIELD_BORDER,
          color: BLACKBOARD_CHALK,
        }}
      />
    </div>
  );
}
