"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GENERAL_ROOM_ID } from "@/lib/chat/constants";

const STORAGE_KEY = "fnoninja-chat-open";

interface ChatPanelContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  roomId: string;
  setRoomId: (roomId: string) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue | undefined>(undefined);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [roomId, setRoomId] = useState(GENERAL_ROOM_ID);

  // Restore last open state (desktop convenience).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 767px)").matches) return; // start closed on mobile
    setOpenState(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const value = useMemo(
    () => ({ open, setOpen, toggle, roomId, setRoomId }),
    [open, setOpen, toggle, roomId],
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
