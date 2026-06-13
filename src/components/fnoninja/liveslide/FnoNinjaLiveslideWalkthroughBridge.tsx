"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveslideWalkthroughOptional } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

/** Registers Liveslide prepare + opens walkthrough from ?tour=liveslide (Suspense boundary). */
export function FnoNinjaLiveslideWalkthroughBridge({
  onPrepare,
}: {
  onPrepare: () => void;
}) {
  const walkthrough = useLiveslideWalkthroughOptional();
  const registerPrepare = walkthrough?.registerPrepare;
  const openWalkthrough = walkthrough?.open;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const onPrepareRef = useRef(onPrepare);
  onPrepareRef.current = onPrepare;

  useEffect(() => {
    if (!registerPrepare) return;
    registerPrepare(() => onPrepareRef.current());
    return () => registerPrepare(null);
  }, [registerPrepare]);

  useEffect(() => {
    if (!openWalkthrough) return;
    if (searchParams.get("tour") !== "liveslide") return;
    void openWalkthrough();
    router.replace(pathname, { scroll: false });
  }, [openWalkthrough, searchParams, router, pathname]);

  return null;
}
