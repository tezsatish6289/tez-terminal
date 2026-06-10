import { FNO_ACCENT, FNO_BG, FNO_LOGO_MARK } from "@/lib/fnoninja/theme";

export function FnoNinjaLogo({
  size = 32,
  showWordmark = true,
  wordmarkClassName = "text-sm sm:text-base",
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  const diamond = Math.round(size * 0.42);

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <span
        className="inline-flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ width: size, height: size, backgroundColor: FNO_LOGO_MARK }}
        aria-hidden
      >
        <svg
          width={diamond}
          height={diamond}
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="6"
            y="0.5"
            width="7.5"
            height="7.5"
            rx="0.5"
            transform="rotate(45 6 6)"
            fill={FNO_BG}
          />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-black tracking-tight truncate ${wordmarkClassName}`}>
          <span className="text-[#f0f4ff]">FNO</span>
          <span style={{ color: FNO_ACCENT }}>NINJA</span>
        </span>
      )}
    </span>
  );
}
