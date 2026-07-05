/** Pause/play inside a ring — slideshow transport convention. */
export function SlideshowTransportIcon({
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
