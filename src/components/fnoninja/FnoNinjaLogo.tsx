import { FnoNinjaLogoMark } from "@/components/fnoninja/FnoNinjaLogoMark";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export function FnoNinjaLogo({
  size = 32,
  showWordmark = true,
  wordmarkClassName = "text-sm sm:text-base",
  markClassName = "rounded-lg",
  squareMark = false,
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  markClassName?: string;
  squareMark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <FnoNinjaLogoMark
        size={size}
        square={squareMark}
        className={`flex-shrink-0 ${markClassName}`.trim()}
      />
      {showWordmark && (
        <span
          className={`font-black tracking-tight truncate uppercase ${wordmarkClassName}`}
          aria-label="FNONINJA"
        >
          <span className="text-[#f0f4ff]">FNO</span>
          <span style={{ color: FNO_ACCENT }}>NINJA</span>
        </span>
      )}
    </span>
  );
}
