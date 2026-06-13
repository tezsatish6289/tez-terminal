"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";
import { FnoNinjaNav } from "@/components/fnoninja/FnoNinjaNav";
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
    <div
      className={isLevelsApp ? FNO_LEVELS_PAGE_ROOT : FNO_PAGE_ROOT}
      style={{ backgroundColor: FNO_BG, color: FNO_TEXT }}
    >
      <FnoNinjaNav />
      <div
        className={`${FB_VIEWPORT_MAIN} flex flex-col flex-1 min-h-0 min-w-0 ${isLevelsApp ? FNO_APP_TOP_GAP_CLASS : ""}`}
      >
        {children}
      </div>
      {!isLevelsApp ? <FnoNinjaFooter /> : null}
    </div>
  );
}
