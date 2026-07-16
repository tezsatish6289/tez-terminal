"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  linkWithPhoneNumber,
  PhoneAuthProvider,
  RecaptchaVerifier,
  unlink,
  type ConfirmationResult,
} from "firebase/auth";
import { Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth, useUser } from "@/firebase";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";
import {
  PHONE_PROMPT_DISMISS_KEY,
  PHONE_PROMPT_DISMISS_MS,
  shouldShowPhonePromptOnPath,
} from "@/lib/fnoninja/phone-verify";
import { normalizeIndianMobile, toE164Indian } from "@/lib/phone-format";
import { fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_MUTED } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";

type PhoneStatus = {
  phoneVerified: boolean;
  phoneMasked: string | null;
  phoneGraceEndsAt: string | null;
  phoneBlocksAccess: boolean;
  softPrompt: boolean;
  isTrial: boolean;
  isPaidActive: boolean;
};

type Step = "phone" | "otp";

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(PHONE_PROMPT_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PHONE_PROMPT_DISMISS_MS;
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(PHONE_PROMPT_DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function clearDismissed() {
  try {
    localStorage.removeItem(PHONE_PROMPT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Collects + OTP-verifies an Indian mobile after Google sign-in.
 * Soft (dismissible) during 24h grace / for paid users; hard-blocks trial after grace.
 */
export function FnoNinjaPhoneGate() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();

  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const fetchedUid = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!user) return null;
    const token = await user.getIdToken();
    const res = await fetch("/api/fnoninja/phone/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not load phone status");
    const data = (await res.json()) as PhoneStatus;
    setStatus(data);
    return data;
  }, [user]);

  useEffect(() => {
    if (isUserLoading || !user) {
      setStatus(null);
      setOpen(false);
      fetchedUid.current = null;
      return;
    }
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(window.location.pathname)) return;
    if (fetchedUid.current === user.uid) return;
    fetchedUid.current = user.uid;

    void refreshStatus()
      .then((data) => {
        if (!data || data.phoneVerified) return;
        if (!shouldShowPhonePromptOnPath(pathname)) return;

        if (data.phoneBlocksAccess) {
          setBlocking(true);
          setOpen(true);
          return;
        }
        // Soft ask during the first 24h — slight delay so it doesn't collide with the trial toast.
        if (data.softPrompt && !readDismissed()) {
          window.setTimeout(() => {
            setBlocking(false);
            setOpen(true);
          }, 2500);
        }
      })
      .catch(() => {
        fetchedUid.current = null;
      });
  }, [user, isUserLoading, pathname, refreshStatus]);

  // Re-check when subscription refresh fires (trial activation, etc.).
  useEffect(() => {
    if (!user) return;
    const onRefresh = () => {
      fetchedUid.current = null;
      void refreshStatus().then((data) => {
        if (!data || data.phoneVerified) {
          setOpen(false);
          setBlocking(false);
          return;
        }
        if (!shouldShowPhonePromptOnPath(pathname)) return;
        if (data.phoneBlocksAccess) {
          setBlocking(true);
          setOpen(true);
        } else if (data.softPrompt && !readDismissed()) {
          setBlocking(false);
          setOpen(true);
        }
      });
    };
    window.addEventListener("fnoninja:subscription-refresh", onRefresh);
    return () => window.removeEventListener("fnoninja:subscription-refresh", onRefresh);
  }, [user, pathname, refreshStatus]);

  // Schedule hard-gate when grace ends while the tab is open.
  useEffect(() => {
    if (!status || status.phoneVerified || !status.phoneGraceEndsAt || !status.isTrial) return;
    const ms = new Date(status.phoneGraceEndsAt).getTime() - Date.now();
    if (ms <= 0) {
      if (!status.phoneBlocksAccess) {
        setBlocking(true);
        setOpen(true);
      }
      return;
    }
    const t = window.setTimeout(() => {
      setBlocking(true);
      setOpen(true);
      window.dispatchEvent(new Event("fnoninja:subscription-refresh"));
    }, Math.min(ms + 500, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [status]);

  const ensureVerifier = useCallback(() => {
    if (!auth) throw new Error("Auth not ready");
    if (verifierRef.current) return verifierRef.current;
    auth.languageCode = "en";
    const verifier = new RecaptchaVerifier(auth, "fnoninja-phone-recaptcha", {
      size: "invisible",
    });
    verifierRef.current = verifier;
    return verifier;
  }, [auth]);

  const resetVerifier = useCallback(() => {
    try {
      verifierRef.current?.clear();
    } catch {
      /* ignore */
    }
    verifierRef.current = null;
  }, []);

  useEffect(() => () => resetVerifier(), [resetVerifier]);

  async function sendOtp() {
    if (!user || !auth) return;
    const normalized = normalizeIndianMobile(phoneInput);
    if (!normalized) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Already linked to this number — just persist server-side.
      const existing = normalizeIndianMobile(user.phoneNumber);
      if (existing === normalized) {
        await persistVerified();
        return;
      }
      if (user.phoneNumber) {
        await unlink(user, PhoneAuthProvider.PROVIDER_ID);
      }
      const verifier = ensureVerifier();
      const result = await linkWithPhoneNumber(user, toE164Indian(normalized), verifier);
      setConfirmation(result);
      setStep("otp");
      trackCtaClick("phone_otp_sent", {});
    } catch (e: unknown) {
      resetVerifier();
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "auth/credential-already-in-use") {
        setError("This number is already linked to another account.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many SMS attempts. Please try again later.");
      } else if (code === "auth/invalid-phone-number") {
        setError("Enter a valid 10-digit Indian mobile number.");
      } else {
        setError(e instanceof Error ? e.message : "Could not send OTP. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function persistVerified() {
    if (!user) return;
    const token = await user.getIdToken(true);
    const res = await fetch("/api/fnoninja/phone/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.code === "phone_trial_used" || data?.code === "phone_owned") {
        try {
          if (user.phoneNumber) await unlink(user, PhoneAuthProvider.PROVIDER_ID);
        } catch {
          /* ignore */
        }
      }
      throw Object.assign(new Error(data?.error || "Verification failed"), {
        code: data?.code,
      });
    }
    clearDismissed();
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            phoneVerified: true,
            phoneBlocksAccess: false,
            softPrompt: false,
            phoneMasked: data.phoneMasked ?? prev.phoneMasked,
          }
        : prev,
    );
    setOpen(false);
    setBlocking(false);
    setStep("phone");
    setOtp("");
    setConfirmation(null);
    trackCtaClick("phone_verified", {});
    window.dispatchEvent(new Event("fnoninja:subscription-refresh"));
  }

  async function confirmOtp() {
    if (!confirmation || !user) return;
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) {
      setError("Enter the 6-digit code from SMS.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmation.confirm(code);
      await persistVerified();
    } catch (e: unknown) {
      const codeName =
        e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (codeName === "auth/invalid-verification-code") {
        setError("Incorrect code. Check the SMS and try again.");
      } else if (codeName === "phone_trial_used") {
        setError(
          e instanceof Error
            ? e.message
            : "This number was already used for a free trial. Subscribe or use another number.",
        );
      } else if (codeName === "phone_owned") {
        setError("This mobile number is already linked to another account.");
      } else {
        setError(e instanceof Error ? e.message : "Could not verify code.");
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (blocking) return;
    writeDismissed();
    setOpen(false);
    trackCtaClick("phone_prompt_dismiss", {});
  }

  const subscribeHref = fnoSubscribeHref(pathname);

  return (
    <>
      {/* Invisible reCAPTCHA anchor for Firebase Phone Auth — always mounted. */}
      <div id="fnoninja-phone-recaptcha" className="hidden" aria-hidden />
      {open && user ? (
      <div
        className="fixed inset-0 z-[260] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Verify mobile number"
      >
        <button
          type="button"
          aria-label={blocking ? "Phone verification required" : "Close"}
          onClick={blocking ? undefined : dismiss}
          className="absolute inset-0 cursor-default"
          style={{ backgroundColor: "rgba(3,7,18,0.72)", backdropFilter: "blur(4px)" }}
          disabled={blocking}
        />

        <div
          className="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl sm:p-7"
          style={{
            backgroundColor: "#0b1524",
            borderColor: "rgba(148,163,184,0.18)",
          }}
        >
          {!blocking ? (
            <button
              type="button"
              aria-label="Remind me later"
              onClick={dismiss}
              className="absolute right-3 top-3 text-[11px] font-semibold underline-offset-2 hover:underline"
              style={{ color: FNO_MUTED }}
            >
              Later
            </button>
          ) : null}

          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(37,99,235,0.14)" }}
          >
            {blocking ? (
              <Lock className="h-5 w-5" style={{ color: "#60a5fa" }} />
            ) : (
              <Smartphone className="h-5 w-5" style={{ color: "#60a5fa" }} />
            )}
          </div>

          <p
            className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: FNO_MUTED }}
          >
            {blocking ? "Required to continue" : "Quick account setup"}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-white">
            {blocking ? "Verify your mobile to keep your trial" : "Add your mobile number"}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
            We use it for account security and important updates — not spam. Your number is stored
            encrypted and never sold. SMS rates may apply for the one-time code.
          </p>

          <div
            className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              borderColor: "rgba(52,211,153,0.25)",
              backgroundColor: "rgba(16,185,129,0.08)",
              color: "#a7f3d0",
            }}
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Encrypted at rest. Used for verification, billing contact, and essential product
              messages only — no marketing spam, no data selling.
            </span>
          </div>

          {step === "phone" ? (
            <>
              <div
                className="mt-5 flex items-center rounded-xl border px-3"
                style={{
                  borderColor: error ? "#ef4444" : "rgba(148,163,184,0.2)",
                  backgroundColor: "#0a1120",
                }}
              >
                <span className="pr-2 text-sm font-semibold text-slate-400">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  maxLength={14}
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendOtp();
                  }}
                  placeholder="10-digit mobile number"
                  className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-600"
                />
              </div>
              {status?.phoneMasked ? (
                <p className="mt-1.5 text-[11px]" style={{ color: FNO_MUTED }}>
                  On file from checkout: {status.phoneMasked} — re-enter to verify with OTP.
                </p>
              ) : null}
              {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => void sendOtp()}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
                style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
              >
                {busy ? "Sending code…" : "Send OTP"}
              </button>
            </>
          ) : (
            <>
              <p className="mt-5 text-[13px]" style={{ color: FNO_MUTED }}>
                Enter the 6-digit code sent to +91 {normalizeIndianMobile(phoneInput)}.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={8}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmOtp();
                }}
                placeholder="6-digit OTP"
                className="mt-3 w-full rounded-xl border bg-[#0a1120] px-3 py-3 text-center text-lg tracking-[0.35em] text-white outline-none"
                style={{ borderColor: error ? "#ef4444" : "rgba(148,163,184,0.2)" }}
              />
              {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmOtp()}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
                style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
              >
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setConfirmation(null);
                  setError(null);
                  resetVerifier();
                }}
                className="mt-2.5 w-full text-center text-[12px] font-semibold underline-offset-2 hover:underline"
                style={{ color: FNO_MUTED }}
              >
                Use a different number
              </button>
            </>
          )}

          {blocking ? (
            <Link
              href={subscribeHref}
              onClick={() => trackCtaClick("phone_gate_subscribe", {})}
              className="mt-4 block text-center text-xs font-semibold text-slate-300 underline-offset-2 hover:underline"
            >
              Or subscribe without verifying a new trial number
            </Link>
          ) : null}
        </div>
      </div>
      ) : null}
    </>
  );
}
