"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { fnoHomeHref } from "@/lib/fnoninja/paths";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ANCHOR_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Disclaimer", href: "#disclaimer" },
] as const;

export function FnoNinjaNav() {
  const pathname = usePathname();
  const homeHref = fnoHomeHref(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.95)",
          borderColor: FNO_NAV_BORDER,
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          className={`${FB_CONTENT_SHELL} h-14 sm:h-16 flex items-center justify-between gap-3 min-w-0`}
        >
          <Link href={homeHref} className="flex items-center gap-2 min-w-0 flex-shrink">
            <Image
              src="/freedombot/icon.png"
              alt="FNONinja"
              width={32}
              height={32}
              className="rounded-xl object-contain flex-shrink-0"
              priority
            />
            <span
              className="font-black text-sm sm:text-base tracking-tight truncate"
              style={{ color: "#f0f4ff" }}
            >
              FNONinja<span style={{ color: "#60a5fa" }}>.com</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {ANCHOR_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:text-white whitespace-nowrap"
                style={{ color: "#64748b" }}
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden md:block">
              <FnoNinjaCtaLink variant="nav">Explore analytics</FnoNinjaCtaLink>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex items-center justify-center h-10 w-10 rounded-xl transition-colors"
              style={{
                color: "#94a3b8",
                border: "1px solid rgba(90,140,220,0.15)",
                backgroundColor: "rgba(37,99,235,0.06)",
              }}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="absolute top-0 right-0 h-full w-[min(100vw-3rem,320px)] flex flex-col shadow-2xl"
            style={{
              backgroundColor: "#0a1628",
              borderLeft: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
              style={{ borderColor: "rgba(90,140,220,0.1)" }}
            >
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "#64748b" }}
              >
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg"
                style={{ color: "#94a3b8" }}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {ANCHOR_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div
              className="p-4 border-t flex-shrink-0"
              style={{ borderColor: "rgba(90,140,220,0.1)" }}
            >
              <FnoNinjaCtaLink variant="nav">Explore analytics</FnoNinjaCtaLink>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
