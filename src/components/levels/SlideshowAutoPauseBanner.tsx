"use client";

/** Shown on liveslide/favslide when chart exploration pauses the symbol timer. */
export function SlideshowAutoPauseBanner({ reason }: { reason: string }) {
  const hint =
    reason === "Atlas"
      ? "Close Atlas AI to resume the slideshow"
      : "Return to Trend Chart to resume";

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
