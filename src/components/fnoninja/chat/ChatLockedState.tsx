"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { fnoMarketingHash } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

/** Shown when the user is signed in but lacks an active trial/subscription. */
export function ChatLockedState() {
  const pathname = usePathname();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
      >
        <Lock className="h-5 w-5" style={{ color: "#60a5fa" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Community chat is a subscriber feature</p>
        <p className="mt-1 text-xs" style={{ color: "#64748b" }}>
          Your trial or subscription has ended. Renew to rejoin the conversation.
        </p>
      </div>
      <Link
        href={fnoMarketingHash(pathname, "#pricing")}
        className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105"
        style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
      >
        View plans
      </Link>
    </div>
  );
}
