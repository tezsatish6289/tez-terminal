"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveslideWalkthroughOptional } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

/** Registers Liveslide prepare + opens walkthrough from ?tour=liveslide (Suspense boundary). */
export function FnoNinjaLiveslideWalkthroughBridge({
  onPrepare,
}: {
  onPrepare: () => void;
}) {
  const walkthrough = useLiveslideWalkthroughOptional();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!walkthrough) return;
    walkthrough.registerPrepare(onPrepare);
    return () => walkthrough.registerPrepare(null);
  }, [walkthrough, onPrepare]);

  useEffect(() => {
    if (!walkthrough) return;
    if (searchParams.get("tour") !== "liveslide") return;
    void walkthrough.open();
    router.replace(pathname, { scroll: false });
  }, [walkthrough, searchParams, router, pathname]);

  return null;
}
