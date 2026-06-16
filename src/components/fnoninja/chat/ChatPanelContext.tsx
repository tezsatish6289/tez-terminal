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
import { CHAT_UNREAD_WINDOW, GENERAL_ROOM_ID } from "@/lib/chat/constants";

const OPEN_STORAGE_KEY = "fnoninja-chat-open";
const readKey = (uid: string, roomId: string) => `fnoninja-chat-read:${uid}:${roomId}`;

interface ChatPanelContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  roomId: string;
  setRoomId: (roomId: string) => void;
  /** Count of messages from others since the user last read this room. */
  unreadCount: number;
}

const ChatPanelContext = createContext<ChatPanelContextValue | undefined>(undefined);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const db = useDatabase();
  const { member } = useChatMember();
  const canChat = member?.canChat === true && member?.isBanned !== true;

  const [open, setOpenState] = useState(false);
  const [roomId, setRoomId] = useState(GENERAL_ROOM_ID);
  const [unreadCount, setUnreadCount] = useState(0);

  // Epoch-ms boundary: messages newer than this are "unread". Kept in a ref so
  // the RTDB subscription can read the latest value without re-subscribing.
  const lastReadRef = useRef<number>(Date.now());
  const openRef = useRef(open);
  openRef.current = open;

  // Load the persisted read boundary whenever the user or room changes. Missing
  // value → treat "now" as read so existing history doesn't show as unread.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const stored = window.localStorage.getItem(readKey(user.uid, roomId));
    lastReadRef.current = stored ? Number(stored) : Date.now();
    setUnreadCount(0);
  }, [user, roomId]);

  const markRead = useCallback(() => {
    const now = Date.now();
    lastReadRef.current = now;
    setUnreadCount(0);
    if (typeof window !== "undefined" && user) {
      window.localStorage.setItem(readKey(user.uid, roomId), String(now));
    }
  }, [user, roomId]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_STORAGE_KEY, next ? "1" : "0");
      }
      if (next) markRead();
    },
    [markRead],
  );

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  // Restore last open state (desktop convenience); start closed on mobile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 767px)").matches) return;
    if (window.localStorage.getItem(OPEN_STORAGE_KEY) === "1") setOpenState(true);
  }, []);

  // Background unread tracker: a small live window we keep subscribed even when
  // the panel is closed, so the nav badge stays current. While the panel is open
  // we instead advance the read boundary so it never shows stale unreads.
  useEffect(() => {
    if (!user || !canChat) {
      setUnreadCount(0);
      return;
    }
    const q = rtdbQuery(
      rtdbRef(db, `rooms/${roomId}/messages`),
      limitToLast(CHAT_UNREAD_WINDOW),
    );
    const unsub = onValue(
      q,
      (snap) => {
        let latest = lastReadRef.current;
        let unread = 0;
        snap.forEach((child) => {
          const v = child.val() as {
            createdAt?: number;
            authorId?: string;
            deleted?: boolean;
          } | null;
          if (!v || typeof v.createdAt !== "number") return;
          if (v.createdAt > latest) latest = v.createdAt;
          if (
            v.createdAt > lastReadRef.current &&
            v.authorId !== user.uid &&
            !v.deleted
          ) {
            unread += 1;
          }
        });

        if (openRef.current) {
          lastReadRef.current = latest;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(readKey(user.uid, roomId), String(latest));
          }
          setUnreadCount(0);
        } else {
          setUnreadCount(unread);
        }
      },
      () => setUnreadCount(0),
    );
    return () => unsub();
  }, [db, user, canChat, roomId]);

  const value = useMemo(
    () => ({ open, setOpen, toggle, roomId, setRoomId, unreadCount }),
    [open, setOpen, toggle, roomId, unreadCount],
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
