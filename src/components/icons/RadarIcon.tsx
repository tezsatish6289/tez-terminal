import { cn } from "@/lib/utils";

interface RadarIconProps {
  className?: string;
}

export function RadarIcon({ className }: RadarIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", className)}
    >
      {/* Concentric arcs */}
      <path d="M19.07 4.93A10 10 0 0 1 22 12c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2" />
      <path d="M16.24 7.76A6 6 0 0 1 18 12c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6" />
      <circle cx="12" cy="12" r="2" />
      {/* Radar sweep line */}
      <line x1="12" y1="12" x2="20" y2="4" />
      <circle cx="20" cy="4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
