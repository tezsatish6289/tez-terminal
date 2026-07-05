"use client";

const OVERLAY_PAUSE_REASONS = new Set(["Atlas", "News", "Chat"]);

export function isSlideshowOverlayPause(reason: string | null | undefined): boolean {
  return reason != null && OVERLAY_PAUSE_REASONS.has(reason);
}

export function slideshowPauseResumeHint(reason: string): string {
  switch (reason) {
    case "Atlas":
      return "Close Atlas AI to resume the slideshow";
    case "News":
      return "Close Recent news to resume the slideshow";
    case "Chat":
      return "Close chat to resume the slideshow";
    default:
      return "Return to Trend Chart to resume";
  }
}

export function slideshowPauseShortHint(reason: string): string {
  switch (reason) {
    case "Atlas":
      return "close Atlas to resume";
    case "News":
      return "close news to resume";
    case "Chat":
      return "close chat to resume";
    default:
      return "return to Trend Chart";
  }
}

/** Shown on liveslide/favslide when chart exploration pauses the symbol timer. */
export function SlideshowAutoPauseBanner({ reason }: { reason: string }) {
  const hint = slideshowPauseResumeHint(reason);

  return (
    <div
      className="mb-1.5 flex items-center justify-center gap-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/[0.06] px-2.5 py-1.5"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400/50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-400/90" />
      </span>
      <p className="text-[10px] sm:text-[11px] font-medium leading-snug text-fuchsia-100/90 text-center">
        Slideshow paused · {reason} — {hint}
      </p>
    </div>
  );
}
