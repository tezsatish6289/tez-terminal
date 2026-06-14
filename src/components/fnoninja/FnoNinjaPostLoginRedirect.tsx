"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/firebase";
import { consumeFnoPostLoginRedirect } from "@/lib/fnoninja/post-login-redirect";
import { isFnoNinjaLandingPath } from "@/lib/fnoninja/paths";

/** Completes landing-header login → bubbles when auth finishes (incl. redirect flow). */
export function FnoNinjaPostLoginRedirect() {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isUserLoading || !user || !isFnoNinjaLandingPath(pathname)) return;
    const href = consumeFnoPostLoginRedirect();
    if (href) router.replace(href);
  }, [user, isUserLoading, pathname, router]);

  return null;
}
