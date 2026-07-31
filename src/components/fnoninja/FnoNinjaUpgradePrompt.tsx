"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Crown, X } from "lucide-react";
import type { Feature } from "@/lib/entitlements";
import { fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_MUTED } from "@/lib/fnoninja/theme";

/** Human labels for the tier-gated (Gold) features. */
const FEATURE_LABEL: Partial<Record<Feature, string>> = {
  atlas_ai: "Atlas AI",
  favslide: "Watchlist Autoplay",
  liveslide: "Livelist Autoplay",
  score_alerts_80: "A+ setup alerts",
};

const FEATURE_BLURB: Partial<Record<Feature, string>> = {
  score_alerts_80:
    "Gold unlocks A+ setup alerts — the sharpest floor (≥80) for fewer, higher-confidence pings. Trial and Silver keep setup alerts at ≥60 and ≥70.",
};

interface UpgradePromptContextValue {
  /**
   * Opens the "upgrade to unlock" prompt for a tier-gated feature. Use this
   * instead of hiding the entry point or redirecting to /subscribe — the
   * feature stays visible and clicking it surfaces the upgrade CTA.
   */
  promptUpgrade: (feature: Feature) => void;
}

const UpgradePromptContext = createContext<UpgradePromptContextValue | null>(null);

/**
 * Access the global upgrade prompt. Returns a no-op if used outside the
 * provider so callers never need to null-check.
 */
export function useUpgradePrompt(): UpgradePromptContextValue {
  return useContext(UpgradePromptContext) ?? { promptUpgrade: () => {} };
}

export function FnoNinjaUpgradePromptProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [feature, setFeature] = useState<Feature | null>(null);

  const promptUpgrade = useCallback((f: Feature) => {
    setFeature(f);
    trackCtaClick("upgrade_prompt_open", { feature: f });
  }, []);

  const close = useCallback(() => setFeature(null), []);

  const value = useMemo<UpgradePromptContextValue>(() => ({ promptUpgrade }), [promptUpgrade]);

  const label = feature ? (FEATURE_LABEL[feature] ?? "This feature") : "";

  return (
    <UpgradePromptContext.Provider value={value}>
      {children}
      {feature ? (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Upgrade to unlock ${label}`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 cursor-default"
            style={{ backgroundColor: "rgba(3,7,18,0.7)", backdropFilter: "blur(4px)" }}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl"
            style={{
              backgroundColor: "#0b1524",
              borderColor: "rgba(148,163,184,0.16)",
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
              style={{ color: FNO_MUTED }}
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(251,191,36,0.14)" }}
            >
              <Crown className="h-5 w-5" style={{ color: "#fbbf24" }} />
            </div>

            <p className="mt-4 text-base font-bold text-white">{label} is a Gold feature</p>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
              {feature && FEATURE_BLURB[feature]
                ? FEATURE_BLURB[feature]
                : `Atlas AI, plus hands-free Livelist & Watchlist autoplay, are included with Gold and the Day Pass. Upgrade to unlock ${label} — you keep everything you already have.`}
            </p>

            <Link
              href={fnoSubscribeHref(pathname)}
              onClick={() => {
                trackCtaClick("upgrade_prompt_cta", { feature });
                close();
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
              style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
            >
              <Crown className="h-4 w-4" />
              Upgrade to Gold
            </Link>
            <button
              type="button"
              onClick={close}
              className="mt-2 w-full rounded-xl px-6 py-2.5 text-xs font-semibold transition-colors hover:text-white"
              style={{ color: FNO_MUTED }}
            >
              Maybe later
            </button>
          </div>
        </div>
      ) : null}
    </UpgradePromptContext.Provider>
  );
}
