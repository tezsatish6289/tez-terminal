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

export type FnoNinjaLevelsViewMode = "bubbles" | "liveslide" | "favslide";

type LiveslideWalkthroughContextValue = {
  open: () => Promise<void>;
  close: () => void;
  registerPrepare: (fn: PrepareFn | null) => void;
  levelsViewMode: FnoNinjaLevelsViewMode;
  registerLevelsViewMode: (mode: FnoNinjaLevelsViewMode) => void;
};

const LiveslideWalkthroughContext = createContext<LiveslideWalkthroughContextValue | null>(
  null,
);

export function FnoNinjaLiveslideWalkthroughProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [levelsViewMode, setLevelsViewMode] = useState<FnoNinjaLevelsViewMode>("bubbles");
  const prepareRef = useRef<PrepareFn | null>(null);

  const registerPrepare = useCallback((fn: PrepareFn | null) => {
    prepareRef.current = fn;
  }, []);

  const registerLevelsViewMode = useCallback((mode: FnoNinjaLevelsViewMode) => {
    setLevelsViewMode(mode);
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
    () => ({ open, close, registerPrepare, registerLevelsViewMode, levelsViewMode }),
    [open, close, registerPrepare, registerLevelsViewMode, levelsViewMode],
  );

  return (
    <LiveslideWalkthroughContext.Provider value={value}>
      {children}
      <FnoNinjaLiveslideWalkthroughOverlay isOpen={isOpen} onClose={close} mode={levelsViewMode} />
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
