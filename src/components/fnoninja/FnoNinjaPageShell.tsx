"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";
import { FnoNinjaNav } from "@/components/fnoninja/FnoNinjaNav";
import { FnoNinjaChatDeepLink } from "@/components/fnoninja/FnoNinjaChatDeepLink";
import { ChatPanel } from "@/components/fnoninja/chat/ChatPanel";
import { ChatPanelProvider } from "@/components/fnoninja/chat/ChatPanelContext";
import { isFnoNinjaLevelsPath } from "@/lib/fnoninja/auth";
import {
  FNO_APP_TOP_GAP_CLASS,
  FNO_LEVELS_PAGE_ROOT,
  FNO_PAGE_ROOT,
} from "@/lib/fnoninja/responsive";
import { FB_VIEWPORT_MAIN } from "@/lib/freedombot/responsive";
import { FNO_BG, FNO_TEXT } from "@/lib/fnoninja/theme";

export function FnoNinjaPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLevelsApp = isFnoNinjaLevelsPath(pathname);

  return (
    <ChatPanelProvider>
      <div
        className={isLevelsApp ? FNO_LEVELS_PAGE_ROOT : FNO_PAGE_ROOT}
        style={{ backgroundColor: FNO_BG, color: FNO_TEXT }}
      >
        <FnoNinjaNav />
        <div
          className={`${FB_VIEWPORT_MAIN} flex flex-col min-w-0 ${
            isLevelsApp
              ? `${FNO_APP_TOP_GAP_CLASS} max-md:flex-none max-md:overflow-visible md:flex-1 md:min-h-0`
              : "flex-1 min-h-0"
          }`}
        >
          {children}
        </div>
        {!isLevelsApp ? <FnoNinjaFooter /> : null}
        <Suspense fallback={null}>
          <FnoNinjaChatDeepLink />
        </Suspense>
        <ChatPanel />
      </div>
    </ChatPanelProvider>
  );
}
