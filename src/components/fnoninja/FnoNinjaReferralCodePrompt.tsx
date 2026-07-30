"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { useUser } from "@/firebase";
import { toast } from "@/hooks/use-toast";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";
import {
  FNO_REFERRAL_STORAGE_KEY,
  FNONINJA_FREE_TRIAL_DAYS,
  FNONINJA_REFERRAL_BONUS_TRIAL_DAYS,
  FNONINJA_TRIAL_WITH_REFERRAL_DAYS,
} from "@/lib/fnoninja/affiliate-shared";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";
import { FNO_REFERRAL_TRACK_EVENT } from "@/components/fnoninja/FnoNinjaAffiliateTracker";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

/** Above map bubbles (z≤320) and phone gate (z=260). */
const REFERRAL_OVERLAY_Z = "z-[400]";
const REFERRAL_CONTENT_Z = "z-[410]";
const TEZ_REFERRAL_STORAGE_KEY = "tez_referral_code";

function hasPendingReferralCode(): boolean {
  return Boolean(
    localStorage.getItem(FNO_REFERRAL_STORAGE_KEY) ||
      localStorage.getItem(TEZ_REFERRAL_STORAGE_KEY),
  );
}

/**
 * After Google login: offer typed referral code for +3 trial days.
 * Skipped if already attributed via ?ref= or previously dismissed.
 */
export function FnoNinjaReferralCodePrompt() {
  const { user, isUserLoading } = useUser();
  const ranForUid = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(window.location.pathname)) return;
    if (ranForUid.current === user.uid) return;
    ranForUid.current = user.uid;

    let cancelled = false;
    let settled = false;

    const evaluatePrompt = async (trackHint?: {
      attributed?: boolean;
      bonusApplied?: boolean;
    }) => {
      if (cancelled || settled) return;
      try {
        const token = await user.getIdToken();
        const statusParams = new URLSearchParams({
          uid: user.uid,
          product: "fnoninja",
        });
        if (user.displayName) statusParams.set("name", user.displayName);
        if (user.email) statusParams.set("email", user.email);
        await fetch(`/api/subscription/status?${statusParams}`);

        // If link track already attributed, never show the typed-code modal.
        if (trackHint?.attributed || trackHint?.bonusApplied) {
          settled = true;
          if (trackHint.bonusApplied) {
            toast({
              title: `${FNONINJA_TRIAL_WITH_REFERRAL_DAYS}-day trial unlocked`,
              description: `Referral link applied — you get ${FNONINJA_REFERRAL_BONUS_TRIAL_DAYS} extra free days.`,
            });
          }
          return;
        }

        const res = await fetch("/api/fnoninja/affiliate/referral-prompt", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          showPrompt?: boolean;
          alreadyReferred?: boolean;
          bonusApplied?: boolean;
        };

        settled = true;

        if (data.alreadyReferred) {
          if (data.bonusApplied) {
            toast({
              title: `${FNONINJA_TRIAL_WITH_REFERRAL_DAYS}-day trial unlocked`,
              description: `Referral applied — you get ${FNONINJA_REFERRAL_BONUS_TRIAL_DAYS} extra free days.`,
            });
          }
          return;
        }

        if (data.showPrompt) setOpen(true);
      } catch {
        if (!cancelled) ranForUid.current = null;
      }
    };

    const pending = hasPendingReferralCode();

    const onTrackDone = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        attributed?: boolean;
        bonusApplied?: boolean;
      };
      void evaluatePrompt(detail);
    };

    window.addEventListener(FNO_REFERRAL_TRACK_EVENT, onTrackDone);

    // No pending link code → short delay then maybe show typed-code prompt.
    // Pending code → wait for tracker event (fallback timeout below).
    const timer = window.setTimeout(
      () => {
        void evaluatePrompt();
      },
      pending ? 4500 : 1000,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(FNO_REFERRAL_TRACK_EVENT, onTrackDone);
    };
  }, [user, isUserLoading]);

  async function applyCode() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/affiliate/apply-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ referralCode: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not apply code");
        return;
      }
      localStorage.removeItem(FNO_REFERRAL_STORAGE_KEY);
      setOpen(false);
      toast({
        title: body.bonusApplied
          ? `${FNONINJA_TRIAL_WITH_REFERRAL_DAYS}-day trial unlocked`
          : "Referral applied",
        description: body.bonusApplied
          ? `You now have ${FNONINJA_TRIAL_WITH_REFERRAL_DAYS} free days (${FNONINJA_FREE_TRIAL_DAYS} + ${FNONINJA_REFERRAL_BONUS_TRIAL_DAYS}).`
          : "You’re linked to your referrer.",
      });
      window.dispatchEvent(new Event("subscription-refresh"));
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    if (!user) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const token = await user.getIdToken();
      await fetch("/api/fnoninja/affiliate/referral-prompt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "dismiss" }),
      });
    } catch {
      /* still close */
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void dismiss();
      }}
    >
      <DialogPortal>
        <DialogOverlay className={`${REFERRAL_OVERLAY_Z} bg-black/75`} />
        <DialogPrimitive.Content
          className={`fixed left-[50%] top-[50%] ${REFERRAL_CONTENT_Z} grid w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-2xl duration-200 sm:rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
          style={{
            backgroundColor: "#0d1b2e",
            borderColor: FNO_NAV_BORDER,
            color: "#f0f4ff",
          }}
        >
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
            style={{ color: "#94a3b8" }}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight text-white">
              Got a referral code?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-slate-400">
              Enter it for{" "}
              <span className="font-semibold text-[#fde68a]">
                {FNONINJA_REFERRAL_BONUS_TRIAL_DAYS} extra free days
              </span>{" "}
              ({FNONINJA_TRIAL_WITH_REFERRAL_DAYS} days total).
              <br />
              <br />
              No code? No worries — you still get a{" "}
              <span className="font-semibold text-slate-200">
                {FNONINJA_FREE_TRIAL_DAYS}-day free trial
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#fbbf24]"
              style={{ borderColor: "rgba(251,191,36,0.35)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyCode();
              }}
            />
            {error ? <p className="text-[12px] text-red-300">{error}</p> : null}
            <button
              type="button"
              disabled={busy || code.trim().length < 4}
              onClick={() => void applyCode()}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply code"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss()}
              className="w-full rounded-xl py-2 text-[13px] font-semibold text-slate-400 transition-colors hover:text-white"
            >
              Continue without code
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
