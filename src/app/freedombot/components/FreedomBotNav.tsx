"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";

export function FreedomBotNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const auth = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isHome = pathname === "/" || pathname === "";

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
    if (isHome) {
      // Signal landing page to open the modal via URL
      router.push("/?deploy=1");
    } else {
      router.push("/?deploy=1");
    }
  };

  const navLinks = [
    { label: "Home",        href: "/"             },
    { label: "Performance", href: "/performance"  },
    { label: "Methodology", href: "/methodology"  },
    { label: "Records",     href: "/records"      },
    { label: "Pricing",     href: "/#pricing"     },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
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
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
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

        {/* Centre nav links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:text-white"
              style={{ color: isActive(l.href) ? "#e2e8f0" : "#64748b" }}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Right CTAs */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="hidden sm:flex items-center px-4 py-2 text-sm font-medium transition-colors hover:text-white disabled:opacity-70"
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
