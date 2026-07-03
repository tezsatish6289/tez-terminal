"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fnoAnalyticsHref, fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

/** Pricing tier trial CTA → dedicated login page. */
export function FnoNinjaPricingTrialCta({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const returnTo = fnoAnalyticsHref(pathname);

  return (
    <Link
      href={fnoLoginHref(pathname, returnTo)}
      className={`inline-flex items-center justify-center font-bold text-white transition-all hover:scale-[1.02] gap-2.5 rounded-xl px-8 py-3.5 text-sm w-full ${className}`}
      style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
    >
      Sign in with Google
    </Link>
  );
}
