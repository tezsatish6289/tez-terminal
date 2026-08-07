"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, Loader2, X } from "lucide-react";
import { useUser } from "@/firebase";
import { toast } from "@/hooks/use-toast";
import {
  DIAMONDS_PER_QUEST,
  FNO_EXPERIENCE_OPTIONS,
  type FnoExperienceValue,
} from "@/lib/fnoninja/rewards-shared";
import {
  fetchRewardsSummary,
  notifyDiamondsChanged,
  submitPersonaExperience,
} from "@/lib/fnoninja/rewards-client";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

const DISMISS_KEY = "fno_persona_quest_later_v1";

/**
 * One-time chart-page F&O experience quest (+10 diamonds).
 * "Later" dismisses for this browser session only.
 */
export function FnoNinjaPersonaQuest() {
  const { user, isUserLoading } = useUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<FnoExperienceValue | null>(null);

  useEffect(() => {
    if (isUserLoading || !user) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    void (async () => {
      try {
        const summary = await fetchRewardsSummary(user);
        if (cancelled) return;
        if (summary.quests.fnoExperience.available) setOpen(true);
      } catch {
        /* ignore — don't block chart */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isUserLoading]);

  const dismissLater = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const submit = useCallback(async () => {
    if (!user || !selected || busy) return;
    setBusy(true);
    try {
      const result = await submitPersonaExperience(user, selected);
      setOpen(false);
      if (result.awarded) {
        notifyDiamondsChanged(result.balance);
        const parts = [`+${result.amount || DIAMONDS_PER_QUEST} diamonds`];
        if (result.daysExtendedThisEarn > 0) {
          parts.push(
            `+${result.daysExtendedThisEarn} day${result.daysExtendedThisEarn === 1 ? "" : "s"} access`,
          );
        }
        toast({ title: "Reward earned", description: parts.join(" · ") });
      } else {
        toast({ title: "Saved", description: "Thanks for sharing your experience." });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusy(false);
    }
  }, [user, selected, busy]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[360] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fno-persona-quest-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-5 shadow-2xl"
        style={{
          backgroundColor: "#0b1220",
          borderColor: "rgba(90,140,220,0.25)",
        }}
      >
        <button
          type="button"
          onClick={dismissLater}
          className="absolute right-3 top-3 rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
          aria-label="Later"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <Gem className="h-5 w-5 text-sky-400" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-400">
            +{DIAMONDS_PER_QUEST} diamonds
          </p>
        </div>

        <h2 id="fno-persona-quest-title" className="text-lg font-black text-white">
          How long have you been trading F&O?
        </h2>
        <p className="mt-1 text-[13px] text-slate-400">
          Answer once and earn diamonds toward free access days.
        </p>

        <div className="mt-4 space-y-2">
          {FNO_EXPERIENCE_OPTIONS.map((opt) => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-colors"
                style={{
                  color: active ? "#e0f2fe" : "#cbd5e1",
                  backgroundColor: active ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.03)",
                  border: active
                    ? "1px solid rgba(96,165,250,0.45)"
                    : "1px solid rgba(90,140,220,0.15)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!selected || busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Claim +{DIAMONDS_PER_QUEST}
          </button>
          <button
            type="button"
            onClick={dismissLater}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
