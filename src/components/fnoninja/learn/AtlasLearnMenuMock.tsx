"use client";

import {
  Activity,
  ChevronRight,
  HelpCircle,
  LineChart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { FNO_ACCENT, FNO_CARD_BG, FNO_MUTED, FNO_TEXT } from "@/lib/fnoninja/theme";

const INTENTS: { icon: LucideIcon; title: string; subtitle: string }[] = [
  {
    icon: LineChart,
    title: "Build an option strategy",
    subtitle: "Hedged, defined-risk option structures from this symbol's data.",
  },
  {
    icon: Activity,
    title: "Build a futures strategy",
    subtitle: "A futures view paired with a protective option to cap risk.",
  },
  {
    icon: HelpCircle,
    title: "I have a different question",
    subtitle: "Learn how to read the zones, OI walls and IV — no strategy generated.",
  },
];

/** Static replica of the Atlas request menu — educational layout only. */
export function AtlasLearnMenuMock({
  symbol = "NIFTY",
  symbolLabel = "Nifty 50",
  compact = false,
  thumbnail = false,
}: {
  symbol?: string;
  symbolLabel?: string;
  compact?: boolean;
  /** Hub card — titles only, minimal padding. */
  thumbnail?: boolean;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: FNO_CARD_BG,
        border: "1px solid rgba(96,165,250,0.22)",
      }}
    >
      <div className={`${thumbnail ? "p-2" : compact ? "p-2.5" : "p-4 sm:p-5"} space-y-1.5`}>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest"
            style={{
              fontSize: thumbnail ? 7 : compact ? 8 : 9,
              color: "#bfdbfe",
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(96,165,250,0.4)",
            }}
          >
            <Sparkles className={thumbnail ? "h-2 w-2" : compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            Atlas AI coach
          </span>
        </div>
        <p
          className={`font-bold text-white ${thumbnail ? "text-[11px]" : compact ? "text-xs" : "text-base"}`}
        >
          {symbolLabel || symbol}
        </p>
        {!thumbnail ? (
          <p className="leading-snug" style={{ color: FNO_MUTED, fontSize: compact ? 10 : 12 }}>
            What would you like Atlas to help you explore for this symbol?
          </p>
        ) : (
          <p className="text-[9px] leading-snug line-clamp-2" style={{ color: FNO_MUTED }}>
            What would you like Atlas to help you explore for this symbol?
          </p>
        )}

        <div className={thumbnail ? "space-y-1 pt-0.5" : compact ? "space-y-1.5 pt-1" : "space-y-2 pt-1"}>
          {INTENTS.map(({ icon: Icon, title, subtitle }) => (
            <div
              key={title}
              className={`flex items-center gap-1.5 rounded-lg ${thumbnail ? "p-1.5" : compact ? "p-2" : "p-3"}`}
              style={{
                backgroundColor: "rgba(8,15,30,0.35)",
                border: "1px solid rgba(96,165,250,0.18)",
              }}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-md ${thumbnail ? "h-6 w-6" : compact ? "h-7 w-7" : "h-9 w-9"}`}
                style={{
                  backgroundColor: "rgba(59,130,246,0.14)",
                  border: "1px solid rgba(96,165,250,0.3)",
                }}
              >
                <Icon
                  className={thumbnail ? "h-2.5 w-2.5" : compact ? "h-3 w-3" : "h-4 w-4"}
                  style={{ color: FNO_ACCENT }}
                  strokeWidth={2}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-bold text-white leading-tight ${thumbnail ? "text-[9px]" : compact ? "text-[11px]" : "text-sm"}`}
                >
                  {title}
                </span>
                {!thumbnail ? (
                  <span
                    className="mt-0.5 block leading-snug"
                    style={{ color: FNO_MUTED, fontSize: compact ? 9 : 11 }}
                  >
                    {subtitle}
                  </span>
                ) : null}
              </span>
              <ChevronRight
                className={`shrink-0 ${thumbnail ? "h-2.5 w-2.5" : compact ? "h-3 w-3" : "h-4 w-4"}`}
                style={{ color: FNO_MUTED }}
              />
            </div>
          ))}
        </div>

        {!compact && !thumbnail ? (
          <p className="pt-1 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
            Atlas only runs when you pick a request above. It&apos;s an educational research
            assistant — not investment advice.
          </p>
        ) : null}
      </div>
    </div>
  );
}
