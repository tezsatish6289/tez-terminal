"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  limitToLast,
  onValue,
  query as rtdbQuery,
  ref as rtdbRef,
} from "firebase/database";
import { useDatabase, useUser } from "@/firebase";
import { useChatMember } from "@/hooks/use-chat-member";
import {
  CHAT_UNREAD_WINDOW,
  GENERAL_ROOM_ID,
  SUBSCRIBED_CHAT_ROOMS,
} from "@/lib/chat/constants";

const OPEN_STORAGE_KEY = "fnoninja-chat-open";
const readKey = (uid: string, roomId: string) => `fnoninja-chat-read:${uid}:${roomId}`;

interface ChatPanelContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  roomId: string;
  setRoomId: (roomId: string) => void;
  /** True when any subscribed channel has unread messages (nav dot). */
  unreadCount: boolean;
  /** Per-channel unread counts — sidebar shows a dot when > 0. */
  unreadByRoom: Record<string, number>;
}

const ChatPanelContext = createContext<ChatPanelContextValue | undefined>(undefined);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const db = useDatabase();
  const { member } = useChatMember();
  const canChat = member?.canChat === true && member?.isBanned !== true;

  const [open, setOpenState] = useState(false);
  const [roomId, setRoomIdState] = useState(GENERAL_ROOM_ID);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});

  const lastReadByRoomRef = useRef<Record<string, number>>({});
  const openRef = useRef(open);
  const roomIdRef = useRef(roomId);
  openRef.current = open;
  roomIdRef.current = roomId;

  const unreadCount = useMemo(
    () => Object.values(unreadByRoom).some((n) => n > 0),
    [unreadByRoom],
  );

  // Load persisted read boundaries whenever the user changes.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const next: Record<string, number> = {};
    for (const room of SUBSCRIBED_CHAT_ROOMS) {
      const stored = window.localStorage.getItem(readKey(user.uid, room.id));
      next[room.id] = stored ? Number(stored) : Date.now();
    }
    lastReadByRoomRef.current = next;
    setUnreadByRoom({});
  }, [user]);

  const markRoomRead = useCallback(
    (targetRoomId: string) => {
      const now = Date.now();
      lastReadByRoomRef.current[targetRoomId] = now;
      setUnreadByRoom((prev) => ({ ...prev, [targetRoomId]: 0 }));
      if (typeof window !== "undefined" && user) {
        window.localStorage.setItem(readKey(user.uid, targetRoomId), String(now));
      }
    },
    [user],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_STORAGE_KEY, next ? "1" : "0");
      }
      if (next) markRoomRead(roomIdRef.current);
    },
    [markRoomRead],
  );

  const setRoomId = useCallback(
    (nextRoomId: string) => {
      setRoomIdState(nextRoomId);
      if (openRef.current) markRoomRead(nextRoomId);
    },
    [markRoomRead],
  );

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  // Restore last open state (desktop convenience); start closed on mobile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 767px)").matches) return;
    if (window.localStorage.getItem(OPEN_STORAGE_KEY) === "1") setOpenState(true);
  }, []);

  // Background unread tracker: one small live window per subscribed channel.
  useEffect(() => {
    if (!user || !canChat) {
      setUnreadByRoom({});
      return;
    }

    const unsubs = SUBSCRIBED_CHAT_ROOMS.map((room) => {
      const q = rtdbQuery(
        rtdbRef(db, `rooms/${room.id}/messages`),
        limitToLast(CHAT_UNREAD_WINDOW),
      );
      return onValue(
        q,
        (snap) => {
          const activeRoomId = roomIdRef.current;
          const panelOpen = openRef.current;
          const lastRead = lastReadByRoomRef.current[room.id] ?? Date.now();
          let latest = lastRead;
          let unread = 0;

          snap.forEach((child) => {
            const v = child.val() as {
              createdAt?: number;
              authorId?: string;
              deleted?: boolean;
            } | null;
            if (!v || typeof v.createdAt !== "number") return;
            if (v.createdAt > latest) latest = v.createdAt;
            if (v.createdAt > lastRead && v.authorId !== user.uid && !v.deleted) {
              unread += 1;
            }
          });

          if (panelOpen && room.id === activeRoomId) {
            lastReadByRoomRef.current[room.id] = latest;
            if (typeof window !== "undefined") {
              window.localStorage.setItem(readKey(user.uid, room.id), String(latest));
            }
            setUnreadByRoom((prev) => ({ ...prev, [room.id]: 0 }));
          } else {
            setUnreadByRoom((prev) => ({ ...prev, [room.id]: unread }));
          }
        },
        () => setUnreadByRoom((prev) => ({ ...prev, [room.id]: 0 })),
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [db, user, canChat]);

  const value = useMemo(
    () => ({ open, setOpen, toggle, roomId, setRoomId, unreadCount, unreadByRoom }),
    [open, setOpen, toggle, roomId, setRoomId, unreadCount, unreadByRoom],
  );

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>;
}

export function useChatPanel(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) {
    throw new Error("useChatPanel must be used within a ChatPanelProvider");
  }
  return ctx;
}
