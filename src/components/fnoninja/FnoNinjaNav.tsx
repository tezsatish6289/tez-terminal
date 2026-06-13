"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Menu, X } from "lucide-react";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { useAuth, useUser } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { isFnoNinjaLevelsPath } from "@/lib/fnoninja/auth";
import { FnoNinjaNavLearn } from "@/components/fnoninja/FnoNinjaNavLearn";
import { FnoNinjaNavLiveslideHelp } from "@/components/fnoninja/FnoNinjaNavLiveslideHelp";
import { FnoNinjaNavSearch } from "@/components/fnoninja/FnoNinjaNavSearch";
import {
  fnoHomeHref,
  fnoLearnHref,
  fnoMarketingHash,
  isFnoNinjaLandingPath,
} from "@/lib/fnoninja/paths";
import { FB_CONTENT_SHELL, FB_LEVELS_SHELL } from "@/lib/freedombot/responsive";
import { FNO_BG, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ANCHOR_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Disclaimer", href: "#disclaimer" },
] as const;

const ICON_BTN_CLASS =
  "flex items-center justify-center shrink-0 p-0 transition-colors hover:text-white";

const ICON_BTN_STYLE = { color: "#94a3b8" } as const;

const MENU_BTN_CLASS =
  "flex items-center justify-center h-10 w-10 rounded-lg transition-colors shrink-0";

const MENU_BTN_STYLE = {
  color: "#94a3b8",
  border: "1px solid rgba(90,140,220,0.15)",
  backgroundColor: "rgba(37,99,235,0.06)",
} as const;

export function FnoNinjaNav() {
  const pathname = usePathname();
  const homeHref = fnoHomeHref(pathname);
  const isLevelsApp = isFnoNinjaLevelsPath(pathname);
  const showNavSearch = !isFnoNinjaLandingPath(pathname);
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const shellClass = isLevelsApp ? FB_LEVELS_SHELL : FB_CONTENT_SHELL;

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
        <div className={`${shellClass} h-14 sm:h-16 flex items-center gap-3 min-w-0`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {isLevelsApp && (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={ICON_BTN_CLASS}
                style={ICON_BTN_STYLE}
                aria-label={menuOpen ? "Close account menu" : "Open account menu"}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}

            <Link href={homeHref} className="flex-shrink-0 min-w-0">
              <FnoNinjaLogo size={34} />
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {isLevelsApp ? <FnoNinjaNavLiveslideHelp /> : null}
            <FnoNinjaNavLearn />
            {showNavSearch ? <FnoNinjaNavSearch /> : null}
            {!isLevelsApp && isFnoNinjaLandingPath(pathname) ? (
              <>
                <div className="hidden md:block">
                  <FnoNinjaCtaLink variant="nav">Explore live market map</FnoNinjaCtaLink>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`md:hidden ${MENU_BTN_CLASS}`}
                  style={MENU_BTN_STYLE}
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                >
                  {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      {menuOpen && isLevelsApp && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            aria-label="Close account menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute top-0 left-0 h-full w-[min(100vw-3rem,320px)] flex flex-col shadow-2xl"
            style={{
              backgroundColor: FNO_BG,
              borderRight: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
              style={{ borderColor: FNO_NAV_BORDER }}
            >
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                Account
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg"
                style={{ color: "#94a3b8" }}
                aria-label="Close account menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
              {isUserLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
                </div>
              ) : user ? (
                <>
                  <div
                    className="rounded-xl px-3 py-3"
                    style={{
                      backgroundColor: "rgba(37,99,235,0.08)",
                      border: "1px solid rgba(90,140,220,0.12)",
                    }}
                  >
                    <p className="text-sm font-semibold text-white truncate">
                      {user.displayName || "Account"}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "#64748b" }}>
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (auth) initiateSignOut(auth);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
                    style={{
                      color: "#f87171",
                      border: "1px solid rgba(90,140,220,0.2)",
                      backgroundColor: "rgba(15,23,42,0.6)",
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                    Sign in with Google to unlock symbol charts and deep-dive analytics.
                  </p>
                  <FnoNinjaGoogleSignInButton
                    className="w-full"
                    onSignedIn={() => setMenuOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {menuOpen && !isLevelsApp && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute top-0 right-0 h-full w-[min(100vw-3rem,320px)] flex flex-col shadow-2xl"
            style={{
              backgroundColor: FNO_BG,
              borderLeft: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
              style={{ borderColor: FNO_NAV_BORDER }}
            >
              <FnoNinjaLogo size={28} wordmarkClassName="text-sm" />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg"
                style={{ color: "#94a3b8" }}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              <Link
                href={fnoLearnHref(pathname)}
                onClick={() => setMenuOpen(false)}
                className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-colors hover:text-white"
                style={{ color: "#94a3b8" }}
              >
                Learn
              </Link>
              {ANCHOR_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={fnoMarketingHash(pathname, l.href)}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-colors hover:text-white"
                  style={{ color: "#94a3b8" }}
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="p-4 border-t flex-shrink-0" style={{ borderColor: FNO_NAV_BORDER }}>
              <FnoNinjaCtaLink variant="nav">Explore live market map</FnoNinjaCtaLink>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
