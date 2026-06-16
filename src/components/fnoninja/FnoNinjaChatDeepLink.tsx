"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { GENERAL_ROOM_ID } from "@/lib/chat/constants";
import { isFnoNinjaLandingPath } from "@/lib/fnoninja/paths";

/**
 * Opens the community chat panel when the URL contains `?chat=1`.
 * Used by the landing "Join the community" CTA after sign-in redirect to the
 * bubble chart — terms/subscription gates still run inside ChatPanel.
 */
export function FnoNinjaChatDeepLink() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen, setRoomId } = useChatPanel();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("chat") !== "1") return;
    if (isFnoNinjaLandingPath(pathname)) return;

    handled.current = true;
    setRoomId(GENERAL_ROOM_ID);
    setOpen(true);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("chat");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, setOpen, setRoomId]);

  return null;
}
