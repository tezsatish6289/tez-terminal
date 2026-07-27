"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SuccessStoriesLiveListener } from "@/components/fnoninja/SuccessStoriesLiveListener";
import { SuccessStoryViewerSheet } from "@/components/fnoninja/SuccessStoryViewerSheet";

/**
 * Global FOMO host: RTDB live banner + replay sheet + `?story=` deep link.
 * Mounted once from FnoNinjaPageShell (all FNO pages, guests included).
 */
export function SuccessStoryLiveHost() {
  return (
    <Suspense fallback={null}>
      <SuccessStoryLiveHostInner />
    </Suspense>
  );
}

function SuccessStoryLiveHostInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [storyId, setStoryId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openStory = useCallback((id: string) => {
    setStoryId(id);
    setOpen(true);
  }, []);

  // Deep link: ?story=<eventId>
  useEffect(() => {
    const id = searchParams.get("story")?.trim();
    if (!id) return;
    openStory(id);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("story");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, openStory]);

  return (
    <>
      <SuccessStoriesLiveListener onWatch={openStory} />
      <SuccessStoryViewerSheet
        storyId={storyId}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setStoryId(null);
        }}
      />
    </>
  );
}
