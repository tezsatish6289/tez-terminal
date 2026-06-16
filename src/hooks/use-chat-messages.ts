"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  limitToLast,
  onValue,
  query as rtdbQuery,
  ref as rtdbRef,
} from "firebase/database";
import {
  collection,
  getDocs,
  limit as fsLimit,
  orderBy,
  query as fsQuery,
  startAfter,
  where,
} from "firebase/firestore";
import { useDatabase, useFirestore } from "@/firebase";
import { CHAT_HISTORY_PAGE, CHAT_LIVE_WINDOW } from "@/lib/chat/constants";
import type { ChatMessage } from "@/lib/chat/types";

export interface UseChatMessagesResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
}

function sortAsc(a: ChatMessage, b: ChatMessage) {
  return a.createdAt - b.createdAt;
}

/**
 * Live community-chat messages for a room.
 *
 * - Live window: RTDB `limitToLast(CHAT_LIVE_WINDOW)` real-time subscription.
 * - Older history: paginated from the Firestore archive on demand.
 *
 * `enabled` should reflect the subscription gate; when false we don't subscribe
 * (the security rules would reject the read anyway).
 */
export function useChatMessages(
  roomId: string,
  enabled: boolean,
): UseChatMessagesResult {
  const db = useDatabase();
  const firestore = useFirestore();

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const oldestCursorRef = useRef<number | null>(null);

  // Reset when the room changes or chat is disabled.
  useEffect(() => {
    setLiveMessages([]);
    setOlderMessages([]);
    setHasMore(true);
    setError(null);
    oldestCursorRef.current = null;
  }, [roomId, enabled]);

  // Live RTDB subscription.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = rtdbQuery(
      rtdbRef(db, `rooms/${roomId}/messages`),
      limitToLast(CHAT_LIVE_WINDOW),
    );
    const unsubscribe = onValue(
      q,
      (snap) => {
        const next: ChatMessage[] = [];
        snap.forEach((child) => {
          const v = child.val() as ChatMessage;
          if (v) next.push({ ...v, id: v.id ?? child.key! });
        });
        next.sort(sortAsc);
        setLiveMessages(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [db, roomId, enabled]);

  const loadOlder = useCallback(async () => {
    if (!enabled || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const combined = [...olderMessages, ...liveMessages];
      const cursor =
        oldestCursorRef.current ??
        (combined.length ? Math.min(...combined.map((m) => m.createdAt)) : Date.now());

      const col = collection(firestore, "chat_rooms", roomId, "messages");
      const q = fsQuery(
        col,
        where("createdAt", "<", cursor),
        orderBy("createdAt", "desc"),
        fsLimit(CHAT_HISTORY_PAGE),
      );
      const snap = await getDocs(q);
      const page: ChatMessage[] = snap.docs.map((d) => d.data() as ChatMessage);

      if (page.length < CHAT_HISTORY_PAGE) setHasMore(false);
      if (page.length) {
        oldestCursorRef.current = Math.min(...page.map((m) => m.createdAt));
        setOlderMessages((prev) => [...page, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history.");
    } finally {
      setLoadingOlder(false);
    }
  }, [enabled, loadingOlder, hasMore, olderMessages, liveMessages, firestore, roomId]);

  // Merge live + older, dedupe by id, sort ascending.
  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of olderMessages) byId.set(m.id, m);
    for (const m of liveMessages) byId.set(m.id, m);
    return Array.from(byId.values()).sort(sortAsc);
  }, [olderMessages, liveMessages]);

  return { messages, loading, error, hasMore, loadingOlder, loadOlder };
}
