"use client";

import {
  LEVELS_STRIP_BOX_LABEL_CLASS,
  LEVELS_STRIP_ICON_BOX_CLASS,
  LEVELS_STRIP_ICON_INNER_CLASS,
} from "@/components/levels/levels-symbol-strip";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
  BLACKBOARD_FILL_ACTIVE,
  BLACKBOARD_WRAPPER,
} from "@/lib/levels/cta-blackboard";

function stripIconBoxStyle(active?: boolean) {
  return {
    ...BLACKBOARD_WRAPPER,
    background: active ? BLACKBOARD_FILL_ACTIVE : BLACKBOARD_FIELD_BG,
    border: active ? "1px solid rgba(59, 130, 246, 0.45)" : BLACKBOARD_FIELD_BORDER,
    boxShadow: "none",
  };
}

/** Pause/play inside a ring — same as levels slideshow transport. */
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

/** Square pause/play + countdown — ditto levels slideshow strip control. */
export function SimSlideshowTransport({
  paused,
  secondsRemaining,
  onToggle,
}: {
  paused: boolean;
  secondsRemaining: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${LEVELS_STRIP_ICON_BOX_CLASS} ${LEVELS_STRIP_ICON_INNER_CLASS} transition-colors hover:border-slate-400/40 active:scale-[0.98]`}
      style={stripIconBoxStyle(paused)}
      aria-label={
        paused
          ? "Resume slideshow — 60 second countdown per bot. Press P or click."
          : `Pause slideshow. ${Math.max(0, secondsRemaining)} seconds until next bot. Press P or click.`
      }
      title={paused ? "Play slideshow" : "Pause slideshow"}
    >
      {paused ? (
        <SlideshowTransportIcon mode="play" color="#f472b6" />
      ) : (
        <SlideshowTransportIcon mode="pause" color={BLACKBOARD_CHALK} />
      )}
      <span
        className={`${LEVELS_STRIP_BOX_LABEL_CLASS} tabular-nums`}
        style={{ color: paused ? "#f472b6" : BLACKBOARD_CHALK_DIM }}
        aria-live="polite"
      >
        {paused ? "Paused" : `${Math.max(0, secondsRemaining)}s`}
      </span>
    </button>
  );
}
