"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FnoNinjaLiveslideWalkthroughOverlay } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughOverlay";

type PrepareFn = () => void | Promise<void>;

type LiveslideWalkthroughContextValue = {
  isOpen: boolean;
  open: () => Promise<void>;
  close: () => void;
  registerPrepare: (fn: PrepareFn | null) => void;
};

const LiveslideWalkthroughContext = createContext<LiveslideWalkthroughContextValue | null>(
  null,
);

export function FnoNinjaLiveslideWalkthroughProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const prepareRef = useRef<PrepareFn | null>(null);

  const registerPrepare = useCallback((fn: PrepareFn | null) => {
    prepareRef.current = fn;
  }, []);

  const open = useCallback(async () => {
    await prepareRef.current?.();
    await new Promise((r) => window.setTimeout(r, 120));
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, open, close, registerPrepare }),
    [isOpen, open, close, registerPrepare],
  );

  return (
    <LiveslideWalkthroughContext.Provider value={value}>
      {children}
      <FnoNinjaLiveslideWalkthroughOverlay isOpen={isOpen} onClose={close} />
    </LiveslideWalkthroughContext.Provider>
  );
}

export function useLiveslideWalkthrough(): LiveslideWalkthroughContextValue {
  const ctx = useContext(LiveslideWalkthroughContext);
  if (!ctx) {
    throw new Error("useLiveslideWalkthrough must be used within FnoNinjaLiveslideWalkthroughProvider");
  }
  return ctx;
}

export function useLiveslideWalkthroughOptional(): LiveslideWalkthroughContextValue | null {
  return useContext(LiveslideWalkthroughContext);
}
