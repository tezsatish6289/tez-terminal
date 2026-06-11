"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Menu, X } from "lucide-react";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { FnoNinjaProfileMenu } from "@/components/fnoninja/FnoNinjaProfileMenu";
import { useAuth, useUser } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { isFnoNinjaLevelsPath } from "@/lib/fnoninja/auth";
import { fnoHomeHref, fnoMarketingHash } from "@/lib/fnoninja/paths";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_BG, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ANCHOR_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Disclaimer", href: "#disclaimer" },
] as const;

export function FnoNinjaNav() {
  const pathname = usePathname();
  const homeHref = fnoHomeHref(pathname);
  const isLevelsApp = isFnoNinjaLevelsPath(pathname);
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
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

  const rightSlot = isLevelsApp ? (
    isUserLoading ? (
      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#60a5fa" }} />
    ) : user ? (
      <FnoNinjaProfileMenu />
    ) : (
      <FnoNinjaGoogleSignInButton />
    )
  ) : (
    <FnoNinjaCtaLink variant="nav">Explore live market map</FnoNinjaCtaLink>
  );

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
          className={`${FB_CONTENT_SHELL} h-14 sm:h-16 flex items-center gap-3 min-w-0`}
        >
          <Link href={homeHref} className="flex-shrink-0 min-w-0">
            <FnoNinjaLogo size={34} />
          </Link>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {isLevelsApp ? (
              rightSlot
            ) : (
              <>
                <div className="hidden md:block">{rightSlot}</div>
                <button
                  type="button"
                  onClick={() => setMobileOpen((v) => !v)}
                  className="md:hidden flex items-center justify-center h-10 w-10 rounded-lg transition-colors"
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
              </>
            )}
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
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
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg"
                style={{ color: "#94a3b8" }}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {isLevelsApp ? (
                <div className="px-4 py-3 space-y-4">
                  {isUserLoading ? (
                    <div className="flex justify-center py-4">
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
                          setMobileOpen(false);
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
                    <FnoNinjaGoogleSignInButton className="w-full" />
                  )}
                </div>
              ) : (
                ANCHOR_LINKS.map((l) => (
                  <a
                    key={l.label}
                    href={fnoMarketingHash(pathname, l.href)}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-colors hover:text-white"
                    style={{ color: "#94a3b8" }}
                  >
                    {l.label}
                  </a>
                ))
              )}
            </nav>

            {!isLevelsApp && (
              <div className="p-4 border-t flex-shrink-0" style={{ borderColor: FNO_NAV_BORDER }}>
                <FnoNinjaCtaLink variant="nav">Explore live market map</FnoNinjaCtaLink>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
