"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";

/** App dashboard (no marketing site nav). */
function isFreedomBotDashboardPath(pathname: string) {
  return pathname === "/freedombot/dashboard" || pathname === "/dashboard";
}

export function FreedomBotNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const auth = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  /** Local dev uses /freedombot/*; production host uses /… with rewrite. */
  const pathBase = pathname.startsWith("/freedombot") ? "/freedombot" : "";
  const isDashboard = isFreedomBotDashboardPath(pathname);

  const handleSignIn = async () => {
    if (user) {
      await auth.signOut();
      return;
    }
    setIsSigningIn(true);
    try {
      await initiateGoogleSignIn(auth);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDeploy = () => {
    router.push("/?deploy=1");
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

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: "rgba(8,15,30,0.95)",
        borderColor: "rgba(90,140,220,0.1)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="w-full px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href={pathBase || "/"} className="flex items-center gap-2.5 flex-shrink-0">
          <Image
            src="/freedombot/icon.png"
            alt="FreedomBot.ai"
            width={32}
            height={32}
            className="rounded-xl object-contain"
            priority
          />
          <span className="font-black text-base tracking-tight" style={{ color: "#f0f4ff" }}>
            FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
          </span>
        </Link>

        {/* Centre nav — hidden on bot dashboard (logged-in app surface) */}
        {!isDashboard && (
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                prefetch
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:text-white"
                style={{ color: isActive(l.href) ? "#e2e8f0" : "#64748b" }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}

        {/* Right CTAs */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
          {user?.email && (
            <span
              className={
                isDashboard
                  ? "inline-block max-w-[min(100vw-12rem,280px)] sm:max-w-[280px] truncate text-xs font-medium px-2 py-1 rounded-lg"
                  : "hidden sm:inline-block max-w-[200px] lg:max-w-[280px] truncate text-xs font-medium px-2 py-1 rounded-lg"
              }
              style={{ color: "#94a3b8", backgroundColor: "rgba(37,99,235,0.08)", border: "1px solid rgba(90,140,220,0.12)" }}
              title={user.email}
            >
              {user.email}
            </span>
          )}
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="flex items-center px-3 sm:px-4 py-2 text-sm font-medium transition-colors hover:text-white disabled:opacity-70"
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
          <button
            onClick={handleDeploy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              boxShadow: "0 4px 15px rgba(59,130,246,0.3)",
            }}
          >
            <Rocket className="h-3.5 w-3.5" /> Deploy a Bot
          </button>
        </div>
      </div>
    </nav>
  );
}
