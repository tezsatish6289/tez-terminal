"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";
import { FNO_ACCENT_SOFT, FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

export function FnoNinjaCtaLink({
  children,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "nav" | "secondary";
  className?: string;
}) {
  const href = fnoAnalyticsHref(usePathname());

  const baseBtn =
    "inline-flex items-center justify-center font-bold transition-all hover:scale-105";

  if (variant === "nav") {
    return (
      <Link
        href={href}
        className={`${baseBtn} gap-1.5 rounded-lg px-4 py-2 text-xs sm:text-sm text-white ${className}`.trim()}
        style={{
          background: FNO_CTA_GRADIENT,
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
        className={`${baseBtn} gap-2 rounded-lg px-7 py-3 text-sm border ${className}`.trim()}
        style={{
          border: "1px solid rgba(90,140,220,0.22)",
          color: "#93c5fd",
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
      className={`${baseBtn} gap-2.5 rounded-lg px-8 py-3.5 text-xs uppercase tracking-widest text-white ${className}`.trim()}
      style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
