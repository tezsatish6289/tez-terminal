"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Rocket,
  ChevronRight,
  ShieldCheck,
  Lock,
  Ban,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import type { Auth, User } from "firebase/auth";

// ─── Data ────────────────────────────────────────────────────────────────────

type Step = "sign-in" | "choose-bot" | "choose-exchange" | "enter-creds" | "success";

const STEP_ORDER: Step[] = ["sign-in", "choose-bot", "choose-exchange", "enter-creds", "success"];
const PROGRESS_STEPS: Step[] = ["choose-bot", "choose-exchange", "enter-creds"];
const STEP_LABELS: Record<Step, string> = {
  "sign-in": "Sign In",
  "choose-bot": "Choose Bot",
  "choose-exchange": "Exchange",
  "enter-creds": "Credentials",
  "success": "Done",
};

const BOTS = [
  { key: "CRYPTO",        emoji: "₿",  name: "Crypto Bot",        description: "24/7 crypto market automation",  live: true  },
  { key: "INDIAN_STOCKS", emoji: "🇮🇳", name: "Indian Stock Bot",  description: "NSE / BSE automated trading",    live: false },
  { key: "GOLD",          emoji: "🥇", name: "Gold Bot",          description: "Precious metals trading",        live: false },
  { key: "SILVER",        emoji: "🥈", name: "Silver Bot",        description: "Precious metals trading",        live: false },
] as const;

interface Field {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  hint?: string;
}
interface Exchange {
  key: string;
  name: string;
  icon: string;
  fields: Field[];
}

// ─── Step-by-step help guides per exchange ───────────────────────────────────

interface HelpGuide {
  url: string;
  urlLabel: string;
  steps: string[];
  warning: string;
}

const HELP_GUIDES: Record<string, HelpGuide> = {
  BINANCE: {
    url: "https://www.binance.com/en/my/settings/api-management",
    urlLabel: "Open Binance API Management",
    steps: [
      "Log in to Binance.com and click your profile icon (top right).",
      'Select "API Management" from the dropdown menu.',
      'Click "Create API" and choose "System generated".',
      'Give it a label (e.g. FreedomBot) and click "Next".',
      "Complete the 2FA verification sent to your email or phone.",
      'Under API restrictions: tick "Enable Reading" and "Enable Spot & Margin Trading". Leave everything else off.',
      'Click "Save" — copy both the API Key and Secret Key immediately.',
    ],
    warning: 'Never enable "Enable Withdrawals" — FreedomBot does not need it and your funds will be safe.',
  },
  BYBIT: {
    url: "https://www.bybit.com/app/user/api-management",
    urlLabel: "Open Bybit API Management",
    steps: [
      "Log in to Bybit.com and click your profile icon (top right).",
      'Go to "Account" → "API Management" from the menu.',
      'Click "Create New Key" — a popup will appear asking you to choose a key type.',
      'Select "System-generated API Keys" (the first option — uses HMAC encryption, simpler to use).',
      'On the next screen, under "API Key Usage" select "API Transaction".',
      'Add a remark/name for your key (e.g. FreedomBot) so you can identify it later.',
      'Set "API Key Permissions" to "Read-Write".',
      'Scroll down to "Trade" permissions. Under "Unified Trading", tick "Orders" and "Positions". Leave everything else unchecked.',
      'Make sure "No IP restriction" is selected (or add our server IP if provided).',
      "Click Submit and complete the 2FA verification (SMS or authenticator app).",
      "Copy your API Key and Secret Key immediately — the secret is shown only once and cannot be recovered.",
    ],
    warning: 'Never enable any "Withdraw" or "Transfer" permissions. FreedomBot only needs Orders and Positions access — your funds cannot be moved.',
  },
  ZERODHA: {
    url: "https://kite.trade",
    urlLabel: "Open Kite.trade",
    steps: [
      "Go to kite.trade and log in with your Zerodha credentials.",
      'Click "Create new app" and fill in a name (e.g. FreedomBot).',
      'Set "Type" to "Connect" and fill in any redirect URL (e.g. https://freedombot.ai).',
      'Click "Create" — your API Key is shown immediately.',
      'Click "Generate" under API Secret to reveal and copy it.',
      "Store both values safely — the secret cannot be regenerated without resetting it.",
    ],
    warning: "Zerodha's API does not allow fund withdrawals — your capital is always safe.",
  },
  UPSTOX: {
    url: "https://account.upstox.com/developer/apps",
    urlLabel: "Open Upstox Developer Apps",
    steps: [
      'Log in to your Upstox account and go to "My Apps" (under your profile).',
      'Click "Create New App" and fill in a name (e.g. FreedomBot).',
      "Enter any Redirect URL (e.g. https://freedombot.ai) and click Create.",
      "Your API Key and API Secret are shown on the app detail page.",
      "Copy both and paste them here.",
    ],
    warning: "Upstox APIs are trade-only — withdrawals are not possible through API keys.",
  },
  ANGEL_ONE: {
    url: "https://smartapi.angelbroking.com/enable-api",
    urlLabel: "Open Angel One Smart API",
    steps: [
      'Log in to angelone.in and go to the "Smart API" section (or visit the link above).',
      "Enable Smart API on your account if not already done.",
      "Your Client ID is your Angel One User ID (shown on your profile or dashboard).",
      "Your Password is the same password you use to log in to Angel One.",
      'For TOTP Secret: open the Angel One app, go to Profile → Security → Enable TOTP. During setup you will see a "secret key" — copy that key (not the 6-digit OTP).',
      "Paste the Client ID, Password, and TOTP Secret here.",
    ],
    warning: "Angel One APIs are trading-only. Withdrawals are never possible via API.",
  },
  DHAN: {
    url: "https://dhanhq.co/developer/api",
    urlLabel: "Open DhanHQ Developer Portal",
    steps: [
      'Log in to dhanhq.co and go to "DhanHQ Developer" then "Apps" from the top menu.',
      'Click "Create App", give it a name (e.g. FreedomBot), and submit.',
      "Your Client ID is your Dhan User ID — find it in Account → Profile.",
      'To get your Access Token: go to the app you just created and click "Generate Token".',
      "Copy the Access Token and paste it here. Tokens expire periodically — you may need to regenerate.",
    ],
    warning: "Dhan access tokens are trade-only. Funds cannot be withdrawn via API.",
  },
};

const EXCHANGES: Record<string, Exchange[]> = {
  CRYPTO: [
    {
      key: "BYBIT", name: "Bybit", icon: "🟡",
      fields: [
        { key: "apiKey",    label: "API Key",    type: "text",     placeholder: "Your Bybit API Key" },
        { key: "apiSecret", label: "API Secret", type: "password", placeholder: "Your Bybit API Secret" },
      ],
    },
  ],
  INDIAN_STOCKS: [
    {
      key: "ZERODHA", name: "Zerodha / Kite", icon: "🟠",
      fields: [
        { key: "apiKey",    label: "API Key",    type: "text",     placeholder: "Your Kite API Key" },
        { key: "apiSecret", label: "API Secret", type: "password", placeholder: "Your Kite API Secret" },
      ],
    },
    {
      key: "UPSTOX", name: "Upstox", icon: "🔵",
      fields: [
        { key: "apiKey",    label: "API Key",    type: "text",     placeholder: "Your Upstox API Key" },
        { key: "apiSecret", label: "API Secret", type: "password", placeholder: "Your Upstox API Secret" },
      ],
    },
    {
      key: "ANGEL_ONE", name: "Angel One", icon: "💙",
      fields: [
        { key: "clientId",   label: "Client ID",    type: "text",     placeholder: "Your Angel One Client ID" },
        { key: "password",   label: "Password",     type: "password", placeholder: "Your Angel One password" },
        { key: "totpSecret", label: "TOTP Secret",  type: "password", placeholder: "From your authenticator app", hint: "Required for 2FA login" },
      ],
    },
    {
      key: "DHAN", name: "Dhan", icon: "🟣",
      fields: [
        { key: "clientId",    label: "Client ID",    type: "text",     placeholder: "Your Dhan Client ID" },
        { key: "accessToken", label: "Access Token", type: "password", placeholder: "Your Dhan access token" },
      ],
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  auth: Auth | null;
}

export function DeployModal({ isOpen, onClose, user, auth }: DeployModalProps) {
  const [step, setStep]                 = useState<Step>("sign-in");
  const [selectedBot, setSelectedBot]   = useState<string>("CRYPTO");
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [credentials, setCredentials]   = useState<Record<string, string>>({});
  const [showPwd, setShowPwd]           = useState<Record<string, boolean>>({});
  const [showHelp, setShowHelp]         = useState(false);
  const [isSigningIn, setIsSigningIn]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]               = useState("");

  // Reset whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(user ? "choose-bot" : "sign-in");
      setSelectedBot("CRYPTO");
      setSelectedExchange(null);
      setCredentials({});
      setShowPwd({});
      setShowHelp(false);
      setError("");
    }
  }, [isOpen, user]);

  // Advance past sign-in once auth resolves inside modal
  useEffect(() => {
    if (user && step === "sign-in") setStep("choose-bot");
  }, [user, step]);

  if (!isOpen) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const currentExchangeDef = selectedExchange
    ? EXCHANGES[selectedBot]?.find((e) => e.key === selectedExchange) ?? null
    : null;

  const botName = BOTS.find((b) => b.key === selectedBot)?.name ?? selectedBot;

  const handleSignIn = async () => {
    if (!auth || isSigningIn) return;
    setIsSigningIn(true);
    setError("");
    try {
      await initiateGoogleSignIn(auth);
      // step advances via useEffect when `user` becomes truthy
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !currentExchangeDef) return;
    setIsSubmitting(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ bot: selectedBot, exchange: selectedExchange, credentials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const credsFilled = currentExchangeDef?.fields.every((f) => credentials[f.key]?.trim()) ?? false;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full sm:max-w-[480px] rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{
          backgroundColor: "#080f1e",
          border: "1px solid rgba(90,140,220,0.25)",
          maxHeight: "92dvh",
        }}
      >
        {/* ── Sticky header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(90,140,220,0.1)" }}
        >
          <div className="flex items-center gap-2.5">
            <Image src="/freedombot/icon.png" alt="FreedomBot" width={22} height={22} className="rounded-lg" />
            <span className="text-sm font-black text-white">Deploy a Bot</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Step progress bar ── */}
        {step !== "sign-in" && step !== "success" && (
          <div className="px-6 pt-5 pb-0 flex-shrink-0">
            <div className="flex items-center gap-1">
              {PROGRESS_STEPS.map((s, i) => {
                const current = STEP_ORDER.indexOf(step);
                const mine    = STEP_ORDER.indexOf(s);
                const done    = current > mine;
                const active  = current === mine;
                return (
                  <div key={s} className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black transition-colors"
                        style={{
                          backgroundColor: done ? "#22c55e" : active ? "#3b82f6" : "rgba(90,140,220,0.1)",
                          color: done || active ? "#fff" : "#334155",
                        }}
                      >
                        {done ? "✓" : i + 1}
                      </div>
                      <span
                        className="text-[10px] font-bold hidden sm:block truncate transition-colors"
                        style={{ color: active ? "#f0f4ff" : done ? "#22c55e" : "#334155" }}
                      >
                        {STEP_LABELS[s]}
                      </span>
                    </div>
                    {i < PROGRESS_STEPS.length - 1 && (
                      <div
                        className="flex-1 h-px mx-1"
                        style={{ backgroundColor: done ? "rgba(34,197,94,0.3)" : "rgba(90,140,220,0.1)" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="px-6 py-6 overflow-y-auto flex-1">
          {/* Error banner */}
          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              {error}
            </div>
          )}

          {/* ── STEP: Sign In ── */}
          {step === "sign-in" && (
            <div className="text-center py-4">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ backgroundColor: "rgba(37,99,235,0.12)", border: "1px solid rgba(90,140,220,0.2)" }}
              >
                <Rocket className="h-8 w-8" style={{ color: "#60a5fa" }} />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Let&apos;s get started</h2>
              <p className="text-sm mb-8 max-w-xs mx-auto leading-relaxed" style={{ color: "#64748b" }}>
                Sign in with Google to deploy and manage your trading bots.
              </p>
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.99] disabled:opacity-70"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 0 30px rgba(37,99,235,0.25)" }}
              >
                {isSigningIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {/* Google icon */}
                    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── STEP: Choose Bot ── */}
          {step === "choose-bot" && (
            <div>
              <h2 className="text-xl font-black text-white mb-1 tracking-tight">Choose your bot</h2>
              <p className="text-sm mb-5" style={{ color: "#64748b" }}>Select the trading bot you want to deploy.</p>
              <div className="space-y-2.5">
                {BOTS.map((bot) => {
                  const isSelected = selectedBot === bot.key;
                  return (
                    <button
                      key={bot.key}
                      onClick={() => bot.live && setSelectedBot(bot.key)}
                      disabled={!bot.live}
                      className="w-full flex items-center justify-between p-4 rounded-2xl text-left transition-all"
                      style={{
                        backgroundColor: isSelected ? "rgba(37,99,235,0.1)" : "rgba(10,22,40,0.6)",
                        border: `1px solid ${isSelected ? "rgba(59,130,246,0.5)" : "rgba(90,140,220,0.1)"}`,
                        opacity: bot.live ? 1 : 0.4,
                        cursor: bot.live ? "pointer" : "not-allowed",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{bot.emoji}</span>
                        <div className="text-left">
                          <p className="text-sm font-black text-white">{bot.name}</p>
                          <p className="text-[11px]" style={{ color: "#475569" }}>{bot.description}</p>
                        </div>
                      </div>
                      {bot.live ? (
                        isSelected ? (
                          <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          </div>
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "#334155" }} />
                        )
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                          Soon
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep("choose-exchange")}
                className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── STEP: Choose Exchange ── */}
          {step === "choose-exchange" && (
            <div>
              <button onClick={() => setStep("choose-bot")} className="flex items-center gap-1.5 text-xs font-bold mb-5 transition-colors" style={{ color: "#475569" }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h2 className="text-xl font-black text-white mb-1 tracking-tight">Choose your exchange</h2>
              <p className="text-sm mb-5" style={{ color: "#64748b" }}>
                Select the exchange or broker your bot will trade on.
              </p>
              <div className="space-y-2.5">
                {(EXCHANGES[selectedBot] ?? []).map((exchange) => {
                  const isSelected = selectedExchange === exchange.key;
                  return (
                    <button
                      key={exchange.key}
                      onClick={() => setSelectedExchange(exchange.key)}
                      className="w-full flex items-center justify-between p-4 rounded-2xl text-left transition-all"
                      style={{
                        backgroundColor: isSelected ? "rgba(37,99,235,0.1)" : "rgba(10,22,40,0.6)",
                        border: `1px solid ${isSelected ? "rgba(59,130,246,0.5)" : "rgba(90,140,220,0.1)"}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{exchange.icon}</span>
                        <p className="text-sm font-black text-white">{exchange.name}</p>
                      </div>
                      {isSelected && (
                        <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Bybit referral prompt */}
              {(EXCHANGES[selectedBot] ?? []).some((e) => e.key === "BYBIT") && (
                <div
                  className="mt-4 flex items-center justify-between px-4 py-3 rounded-2xl"
                  style={{ backgroundColor: "rgba(10,22,40,0.6)", border: "1px solid rgba(90,140,220,0.1)" }}
                >
                  <p className="text-xs" style={{ color: "#475569" }}>
                    Don&apos;t have a Bybit account?
                  </p>
                  <a
                    href="https://www.bybit.com/invite?ref=80NAZZM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-bold transition-opacity hover:opacity-80"
                    style={{ color: "#60a5fa" }}
                  >
                    Create account <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              <button
                onClick={() => { setCredentials({}); setShowPwd({}); setStep("enter-creds"); }}
                disabled={!selectedExchange}
                className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── STEP: Enter Credentials ── */}
          {step === "enter-creds" && currentExchangeDef && (
            <div>
              <button onClick={() => { setStep("choose-exchange"); setShowHelp(false); }} className="flex items-center gap-1.5 text-xs font-bold mb-5 transition-colors" style={{ color: "#475569" }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h2 className="text-xl font-black text-white mb-1 tracking-tight">API Credentials</h2>
              <p className="text-sm mb-5" style={{ color: "#64748b" }}>
                Connect your <span className="text-white font-semibold">{currentExchangeDef.name}</span> account. We encrypt everything before saving.
              </p>

              {/* ── Security trust panel ── */}
              <div
                className="rounded-2xl mb-5 overflow-hidden"
                style={{ border: "1px solid rgba(16,185,129,0.2)", backgroundColor: "rgba(16,185,129,0.04)" }}
              >
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(16,185,129,0.12)" }}>
                  <ShieldCheck className="h-4 w-4 flex-shrink-0" style={{ color: "#34d399" }} />
                  <span className="text-sm font-black" style={{ color: "#34d399" }}>Your funds are completely safe</span>
                </div>
                <div className="divide-y" style={{ borderColor: "rgba(16,185,129,0.08)" }}>
                  {[
                    { icon: <Lock className="h-3.5 w-3.5" />, title: "AES-256 Encrypted", body: "Your API keys are encrypted the moment you submit. We never store plain-text credentials — ever." },
                    { icon: <Ban className="h-3.5 w-3.5" />, title: "No Withdrawal Access", body: "FreedomBot only needs read + trade permissions. It physically cannot move funds out of your account." },
                    { icon: <RefreshCw className="h-3.5 w-3.5" />, title: "Revoke Anytime", body: "You can delete your API key from your exchange dashboard at any time to immediately cut off all access." },
                  ].map(({ icon, title, body }) => (
                    <div key={title} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 flex-shrink-0" style={{ color: "#34d399" }}>{icon}</span>
                      <div>
                        <p className="text-[12px] font-black text-white mb-0.5">{title}</p>
                        <p className="text-[11px] leading-relaxed" style={{ color: "#64748b" }}>{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Credential fields ── */}
              <div className="space-y-4">
                {currentExchangeDef.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-[11px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: "#475569" }}>
                      {field.label}
                    </label>
                    {field.hint && (
                      <p className="text-[10px] mb-1" style={{ color: "#334155" }}>{field.hint}</p>
                    )}
                    <div className="relative">
                      <input
                        type={field.type === "password" && !showPwd[field.key] ? "password" : "text"}
                        value={credentials[field.key] ?? ""}
                        onChange={(e) => setCredentials((p) => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        autoComplete="off"
                        className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-700 outline-none transition-all"
                        style={{
                          backgroundColor: "#060d1a",
                          border: "1px solid rgba(90,140,220,0.15)",
                          fontFamily: "ui-monospace, monospace",
                          letterSpacing: field.type === "password" && !showPwd[field.key] ? "0.1em" : "normal",
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)")}
                        onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(90,140,220,0.15)")}
                      />
                      {field.type === "password" && (
                        <button
                          type="button"
                          onClick={() => setShowPwd((p) => ({ ...p, [field.key]: !p[field.key] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: "#334155" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#334155")}
                        >
                          {showPwd[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Need help guide ── */}
              {HELP_GUIDES[currentExchangeDef.key] && (
                <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(90,140,220,0.15)" }}>
                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors"
                    style={{ backgroundColor: showHelp ? "#0a1628" : "rgba(10,22,40,0.4)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black" style={{ color: "#60a5fa" }}>
                        📖 How to get your {currentExchangeDef.name} API keys
                      </span>
                    </div>
                    {showHelp
                      ? <ChevronUp className="h-4 w-4 flex-shrink-0" style={{ color: "#475569" }} />
                      : <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "#475569" }} />
                    }
                  </button>

                  {showHelp && (() => {
                    const guide = HELP_GUIDES[currentExchangeDef.key];
                    return (
                      <div style={{ backgroundColor: "#060d1a", borderTop: "1px solid rgba(90,140,220,0.1)" }}>
                        <ol className="p-4 space-y-3">
                          {guide.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span
                                className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
                              >
                                {i + 1}
                              </span>
                              <p className="text-[12px] leading-relaxed" style={{ color: "#94a3b8" }}>{step}</p>
                            </li>
                          ))}
                        </ol>

                        {/* Warning */}
                        <div className="mx-4 mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
                          <span className="text-sm flex-shrink-0">⚠️</span>
                          <p className="text-[11px] leading-relaxed font-medium" style={{ color: "#fbbf24" }}>{guide.warning}</p>
                        </div>

                        {/* Direct link */}
                        <div className="px-4 pb-4">
                          <a
                            href={guide.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                            style={{ color: "#60a5fa" }}
                          >
                            {guide.urlLabel} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !credsFilled}
                className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Rocket className="h-4 w-4" /> Deploy Bot</>
                )}
              </button>
            </div>
          )}

          {/* ── STEP: Success ── */}
          {step === "success" && (
            <div className="text-center py-6">
              <div
                className="h-20 w-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                style={{ backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
              >
                <CheckCircle2 className="h-10 w-10" style={{ color: "#34d399" }} />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Bot Deployed! 🎉</h2>
              <p className="text-sm mb-2 max-w-xs mx-auto leading-relaxed" style={{ color: "#64748b" }}>
                Your{" "}
                <span className="text-white font-semibold">{botName}</span> is being configured on{" "}
                <span className="text-white font-semibold">{currentExchangeDef?.name ?? selectedExchange}</span>.
              </p>
              <p className="text-xs mb-8" style={{ color: "#334155" }}>
                Our team will activate your bot shortly. You&apos;ll receive an update at your registered email.
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href="/live"
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.01]"
                  style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
                >
                  <Rocket className="h-4 w-4" /> Go to Dashboard
                </a>
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl text-sm font-bold transition-colors"
                  style={{ color: "#475569" }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
