"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SlideViewMode = "bubbles" | "liveslide" | "favslide";

/**
 * Keeps the levels view mode in the URL as a sticky `?view=` param so a
 * refresh / bookmark / share restores liveslide or favslide instead of
 * defaulting back to bubbles. Bubbles is the default (no param).
 *
 * Also honours the legacy `?slide=` deep link on first load, then rewrites it
 * to `?view=`.
 */
export function LevelsViewUrlSync({
  viewMode,
  onEnterLiveslide,
  onEnterFavslide,
}: {
  viewMode: SlideViewMode;
  onEnterLiveslide: () => void;
  onEnterFavslide: () => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const restoredRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Mount: restore the mode encoded in the URL (accepts legacy `?slide=`).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const view = searchParams.get("view") ?? searchParams.get("slide");
    if (view === "liveslide") onEnterLiveslide();
    else if (view === "favslide") onEnterFavslide();
    setReady(true);
  }, [searchParams, onEnterLiveslide, onEnterFavslide]);

  // Keep the URL in sync with the active mode (replace — no history spam).
  useEffect(() => {
    if (!ready) return;
    const desired = viewMode === "bubbles" ? null : viewMode;
    const current = searchParams.get("view");
    const hasLegacy = searchParams.has("slide");
    if (current === desired && !hasLegacy) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("slide");
    if (desired) next.set("view", desired);
    else next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ready, viewMode, searchParams, pathname, router]);

  return null;
}
