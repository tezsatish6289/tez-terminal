import {
  FNO_LOGO_DIAMOND_ORIGIN,
  FNO_LOGO_DIAMOND_RX,
  FNO_LOGO_DIAMOND_SIDE,
  FNO_LOGO_MARK_RX,
  FNO_LOGO_MARK_VIEWBOX,
} from "@/lib/fnoninja/logo-mark";
import { FNO_BG, FNO_LOGO_MARK } from "@/lib/fnoninja/theme";

export function FnoNinjaLogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const cx = FNO_LOGO_MARK_VIEWBOX / 2;
  const cy = FNO_LOGO_MARK_VIEWBOX / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${FNO_LOGO_MARK_VIEWBOX} ${FNO_LOGO_MARK_VIEWBOX}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        width={FNO_LOGO_MARK_VIEWBOX}
        height={FNO_LOGO_MARK_VIEWBOX}
        rx={FNO_LOGO_MARK_RX}
        fill={FNO_LOGO_MARK}
      />
      <rect
        x={FNO_LOGO_DIAMOND_ORIGIN}
        y={FNO_LOGO_DIAMOND_ORIGIN}
        width={FNO_LOGO_DIAMOND_SIDE}
        height={FNO_LOGO_DIAMOND_SIDE}
        rx={FNO_LOGO_DIAMOND_RX}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={FNO_BG}
      />
    </svg>
  );
}
