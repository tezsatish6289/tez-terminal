"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Enter liveslide / favslide when the levels URL contains `?slide=`. */
export function LevelsSlideshowDeepLink({
  onLiveslide,
  onFavslide,
}: {
  onLiveslide: () => void;
  onFavslide: () => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const slide = searchParams.get("slide");
    if (slide !== "liveslide" && slide !== "favslide") return;

    handled.current = true;
    if (slide === "liveslide") onLiveslide();
    else onFavslide();

    const next = new URLSearchParams(searchParams.toString());
    next.delete("slide");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, onLiveslide, onFavslide]);

  return null;
}
