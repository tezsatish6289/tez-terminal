"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/firebase";
import { consumeFnoPostLoginRedirect } from "@/lib/fnoninja/post-login-redirect";
import { fnoAppHref, isFnoNinjaLandingPath } from "@/lib/fnoninja/paths";

/** Signed-in users skip marketing landing → levels app; honors explicit post-login href first. */
export function FnoNinjaPostLoginRedirect() {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isUserLoading || !user || !isFnoNinjaLandingPath(pathname)) return;
    const href = consumeFnoPostLoginRedirect() ?? fnoAppHref(pathname);
    router.replace(href);
  }, [user, isUserLoading, pathname, router]);

  return null;
}

/** Hides landing content while authenticated users are redirected to the app. */
export function FnoNinjaLandingGate({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();

  if (!isFnoNinjaLandingPath(pathname)) return children;
  if (!isUserLoading && user) return null;

  return children;
}
