"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";

export function FnoNinjaCtaLink({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "nav";
}) {
  const href = fnoAnalyticsHref(usePathname());

  if (variant === "nav") {
    return (
      <Link
        href={href}
        className="inline-flex items-center rounded-lg px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
        style={{
          backgroundColor: "rgba(16,185,129,0.15)",
          border: "1px solid rgba(52,211,153,0.35)",
          color: "#6ee7b7",
        }}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-emerald-950 transition-opacity hover:opacity-90"
      style={{ backgroundColor: "#6ee7b7" }}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
