"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Menu, X } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";

import { isFreedomBotDashboardPath } from "@/lib/freedombot/dashboard-path";

export function FreedomBotNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const auth = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /** Local dev uses /freedombot/*; production host uses /… with rewrite. */
  const pathBase = pathname.startsWith("/freedombot") ? "/freedombot" : "";
  const isDashboard = isFreedomBotDashboardPath(pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignIn = async () => {
    if (user) {
      await auth.signOut();
      setMobileOpen(false);
      return;
    }
    setIsSigningIn(true);
    try {
      await initiateGoogleSignIn(auth);
      setMobileOpen(false);
    } finally {
      setIsSigningIn(false);
    }
  };

  const navLinks = pathBase
    ? ([
        { label: "Home", href: "/freedombot" },
        { label: "Performance", href: "/freedombot/performance" },
        { label: "Methodology", href: "/freedombot/methodology" },
        { label: "Records", href: "/freedombot/records" },
        { label: "Pricing", href: "/freedombot#pricing" },
      ] as const)
    : ([
        { label: "Home", href: "/" },
        { label: "Performance", href: "/performance" },
        { label: "Methodology", href: "/methodology" },
        { label: "Records", href: "/records" },
        { label: "Pricing", href: "/#pricing" },
      ] as const);

  const isActive = (href: string) => {
    if (href === "/" || href === "/freedombot") {
      return pathname === "/" || pathname === "/freedombot";
    }
    if (href.endsWith("#pricing")) {
      return pathname === "/freedombot" || pathname === "/";
    }
    return pathname === href;
  };

  const linkStyle = (href: string) => ({
    color: isActive(href) ? "#e2e8f0" : "#64748b",
  });

  return (
    <>
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.95)",
          borderColor: "rgba(90,140,220,0.1)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 min-w-0">
          {/* Logo */}
          <Link href={pathBase || "/"} className="flex items-center gap-2 min-w-0 flex-shrink">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot.ai"
              width={32}
              height={32}
              className="rounded-xl object-contain flex-shrink-0"
              priority
            />
            <span className="font-black text-sm sm:text-base tracking-tight truncate" style={{ color: "#f0f4ff" }}>
              FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
            </span>
          </Link>

          {/* Centre nav — desktop marketing pages only */}
          {!isDashboard && (
            <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
              {navLinks.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  prefetch
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:text-white whitespace-nowrap"
                  style={linkStyle(l.href)}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}

          {/* Right — desktop sign-in; mobile menu trigger */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="hidden md:flex items-center px-4 py-2 text-sm font-medium transition-colors hover:text-white disabled:opacity-70"
              style={{ color: "#64748b" }}
            >
              {isSigningIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user ? (
                "Sign Out"
              ) : (
                "Sign In"
              )}
            </button>

            {!isDashboard && (
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
            )}

            {isDashboard && (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="md:hidden flex items-center px-3 py-2 text-sm font-medium transition-colors hover:text-white disabled:opacity-70"
                style={{ color: "#64748b" }}
              >
                {isSigningIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : user ? (
                  "Sign Out"
                ) : (
                  "Sign In"
                )}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile menu — marketing pages only */}
      {!isDashboard && mobileOpen && (
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
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
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
              {navLinks.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  prefetch
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-colors"
                  style={{
                    color: isActive(l.href) ? "#f0f4ff" : "#94a3b8",
                    backgroundColor: isActive(l.href) ? "rgba(37,99,235,0.12)" : "transparent",
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <div
              className="p-4 border-t flex-shrink-0 space-y-3"
              style={{ borderColor: "rgba(90,140,220,0.1)" }}
            >
              {user?.email && (
                <p
                  className="text-xs font-medium px-3 py-2 rounded-lg truncate"
                  style={{
                    color: "#94a3b8",
                    backgroundColor: "rgba(37,99,235,0.08)",
                    border: "1px solid rgba(90,140,220,0.12)",
                  }}
                  title={user.email}
                >
                  {user.email}
                </p>
              )}
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-70"
                style={{
                  color: "#cbd5e1",
                  border: "1px solid rgba(90,140,220,0.2)",
                  backgroundColor: "rgba(15,23,42,0.6)",
                }}
              >
                {isSigningIn ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : user ? (
                  "Sign Out"
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
