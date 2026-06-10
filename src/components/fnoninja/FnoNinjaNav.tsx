"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { fnoHomeHref } from "@/lib/fnoninja/paths";
import { FNO_CONTENT_SHELL } from "@/lib/fnoninja/responsive";

export function FnoNinjaNav() {
  const pathname = usePathname();
  const homeHref = fnoHomeHref(pathname);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(6, 9, 18, 0.85)",
      }}
    >
      <div
        className={`${FNO_CONTENT_SHELL} h-14 sm:h-16 flex items-center justify-between gap-4`}
      >
        <Link href={homeHref} className="flex items-center gap-2.5 shrink-0">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black"
            style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,182,212,0.2))",
              border: "1px solid rgba(52,211,153,0.35)",
              color: "#6ee7b7",
            }}
          >
            FNO
          </span>
          <span className="text-sm font-bold tracking-tight text-white">
            FNONinja
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <a href="#how-it-works" className="hover:text-slate-300 transition-colors">
            How it works
          </a>
          <a href="#features" className="hover:text-slate-300 transition-colors">
            Features
          </a>
          <a href="#disclaimer" className="hover:text-slate-300 transition-colors">
            Disclaimer
          </a>
        </nav>

        <FnoNinjaCtaLink variant="nav">Explore analytics</FnoNinjaCtaLink>
      </div>
    </header>
  );
}
