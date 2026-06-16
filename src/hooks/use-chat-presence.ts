"use client";

import { useEffect, useState } from "react";
import {
  onDisconnect,
  onValue,
  ref as rtdbRef,
  serverTimestamp,
  set as rtdbSet,
} from "firebase/database";
import { useDatabase, useUser } from "@/firebase";

/**
 * Presence for a chat room. Writes the user under `presence/{roomId}/{uid}`,
 * registers an onDisconnect cleanup, and returns the live online count.
 */
export function useChatPresence(roomId: string, enabled: boolean): number {
  const db = useDatabase();
  const { user } = useUser();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !user) {
      setCount(0);
      return;
    }

    const selfRef = rtdbRef(db, `presence/${roomId}/${user.uid}`);
    const roomRef = rtdbRef(db, `presence/${roomId}`);

    // Mark present and ensure cleanup when the connection drops.
    rtdbSet(selfRef, { online: true, at: serverTimestamp() }).catch(() => {});
    const disconnect = onDisconnect(selfRef);
    disconnect.remove().catch(() => {});

    const unsub = onValue(
      roomRef,
      (snap) => setCount(snap.size),
      () => setCount(0),
    );

    return () => {
      unsub();
      disconnect.cancel().catch(() => {});
      rtdbSet(selfRef, null).catch(() => {});
    };
  }, [db, roomId, enabled, user]);

  return count;
}
