"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

export function FnoNinjaCtaLink({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "nav" | "secondary";
}) {
  const href = fnoAnalyticsHref(usePathname());

  if (variant === "nav") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all hover:scale-105"
        style={{
          background: FNO_CTA_GRADIENT,
          boxShadow: FNO_CTA_SHADOW,
          color: "#fff",
        }}
      >
        {children}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }

  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold transition-all hover:scale-105"
        style={{
          border: "1px solid rgba(90,140,220,0.22)",
          color: "#93c5fd",
          backgroundColor: "rgba(37,99,235,0.05)",
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
      className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white transition-all hover:scale-105"
      style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
