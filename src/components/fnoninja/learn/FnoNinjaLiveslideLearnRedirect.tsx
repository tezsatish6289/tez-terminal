"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** /learn/liveslide → market map with in-app Liveslide guide. */
export function FnoNinjaLiveslideLearnRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    router.replace(`${fnoAnalyticsHref(pathname)}?tour=liveslide`);
  }, [pathname, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_ACCENT }} />
      <p className="text-sm" style={{ color: "#64748b" }}>
        Opening Liveslide guide…
      </p>
    </div>
  );
}
