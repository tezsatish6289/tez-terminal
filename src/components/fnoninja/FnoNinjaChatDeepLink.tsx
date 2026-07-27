"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { GENERAL_ROOM_ID, isKnownRoom } from "@/lib/chat/constants";
import { isFnoNinjaLandingPath } from "@/lib/fnoninja/paths";

/**
 * Opens the community chat panel when the URL contains `?chat=1`.
 * Optional `?room=<id>` (e.g. success-stories). Defaults to General.
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
    const roomParam = searchParams.get("room")?.trim() ?? "";
    const roomId = roomParam && isKnownRoom(roomParam) ? roomParam : GENERAL_ROOM_ID;
    setRoomId(roomId);
    setOpen(true);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("chat");
    next.delete("room");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, setOpen, setRoomId]);

  return null;
}
