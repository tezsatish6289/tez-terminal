"use client";

import { formatChatUnreadCount } from "@/lib/chat/unread-badge";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** Numeric unread pill for toolbar and room sidebar. */
export function ChatUnreadBadge({
  count,
  size = "md",
  className = "",
}: {
  count: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const label = formatChatUnreadCount(count);
  if (!label) return null;

  const compact = size === "sm";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none text-white ${compact ? "min-w-[14px] h-[14px] px-0.5 text-[8px]" : "min-w-[16px] h-4 px-1 text-[9px]"} ${className}`.trim()}
      style={{
        backgroundColor: FNO_ACCENT,
        boxShadow: "0 0 0 2px rgba(8,15,30,0.95)",
      }}
      aria-hidden
    >
      {label}
    </span>
  );
}
