"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";
import { FNO_ACCENT_SOFT, FNO_CTA_BG, FNO_CTA_SHADOW, FNO_CTA_TEXT } from "@/lib/fnoninja/theme";

export function FnoNinjaCtaLink({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "nav" | "secondary";
}) {
  const href = fnoAnalyticsHref(usePathname());

  const greenBtn =
    "inline-flex items-center justify-center font-bold transition-all hover:brightness-110 active:scale-[0.98]";

  if (variant === "nav") {
    return (
      <Link
        href={href}
        className={`${greenBtn} gap-1.5 rounded-lg px-4 py-2 text-xs sm:text-sm`}
        style={{
          backgroundColor: FNO_CTA_BG,
          color: FNO_CTA_TEXT,
          boxShadow: FNO_CTA_SHADOW,
        }}
      >
        {children}
      </Link>
    );
  }

  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className={`${greenBtn} gap-2 rounded-lg px-7 py-3 text-sm border`}
        style={{
          borderColor: "rgba(29,185,120,0.35)",
          color: FNO_CTA_BG,
          backgroundColor: FNO_ACCENT_SOFT,
        }}
      >
        {children}
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`${greenBtn} gap-2.5 rounded-lg px-8 py-3.5 text-xs uppercase tracking-widest`}
      style={{
        backgroundColor: FNO_CTA_BG,
        color: FNO_CTA_TEXT,
        boxShadow: FNO_CTA_SHADOW,
      }}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
