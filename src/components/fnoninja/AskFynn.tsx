"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  HelpCircle,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_MUTED, FNO_TEXT, FNO_CARD_BG } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";
import { useAuth } from "@/firebase";
import type {
  AtlasValidateResult,
  CheckStatus,
  IdeaBias,
  ValidateVerdict,
} from "@/lib/levels/atlas-validate";

/** Static educational answers — no AI call. */
const ATLAS_FAQ: { q: string; a: string }[] = [
  {
    q: "What does Atlas validate?",
    a: "You state whether you are bullish or bearish. Atlas checks that idea against spot vs support/resistance, day OI wall buildup, multi-day OI history, news sentiment, daily PVT since the zone hit, and 15m intraday PVT — then tells you if the idea lines up, partially lines up, or conflicts, and why.",
  },
  {
    q: "What does \u201cmax pain\u201d mean?",
    a: "Max pain is the strike where the most options (calls + puts) would expire worthless \u2014 i.e. where option buyers collectively lose the most. It's often described as a mild magnet into expiry because option writers benefit if price drifts there. Treat it as a soft bias, never a target or a prediction.",
  },
  {
    q: "How do I read the OI walls?",
    a: "An open-interest (OI) wall is a strike with an unusually large number of open option contracts. A heavy put wall below price often behaves like a support floor; a heavy call wall above often behaves like a resistance cap. They show where positioning is concentrated \u2014 not where price must go.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Atlas is an educational research tool. It pressure-tests your stated idea against market data — it does not tell you to buy or sell, does not predict prices, and does not consider your personal circumstances. Always do your own research or consult a registered adviser.",
  },
];

type AtlasView = "menu" | "result" | "faq";

const ATLAS_LABEL = "Atlas AI";

const CARD_STYLE = {
  backgroundColor: FNO_CARD_BG,
  border: "1px solid rgba(96,165,250,0.2)",
} as const;

const VERDICT_STYLE: Record<
  ValidateVerdict,
  { label: string; color: string; blurb: string }
> = {
  aligned: {
    label: "Aligned",
    color: "#34d399",
    blurb: "Checks support your idea",
  },
  partially_aligned: {
    label: "Partially aligned",
    color: "#fcd34d",
    blurb: "Mixed evidence — some support, some conflict",
  },
  not_aligned: {
    label: "Not aligned",
    color: "#f87171",
    blurb: "Checks push against your idea",
  },
};

function statusIcon(status: CheckStatus) {
  if (status === "support") {
    return <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#34d399" }} strokeWidth={2.5} />;
  }
  if (status === "conflict") {
    return <X className="h-3.5 w-3.5 shrink-0" style={{ color: "#f87171" }} strokeWidth={2.5} />;
  }
  return <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: FNO_MUTED }} strokeWidth={2.5} />;
}

function statusLabel(status: CheckStatus): string {
  if (status === "support") return "Supports";
  if (status === "conflict") return "Conflicts";
  return "Neutral";
}

export function AskFynn({
  scope,
  symbol,
  label,
  iconOnly = false,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: {
  scope: LevelsTvScope;
  symbol: string;
  label?: string;
  /** Icon-only trigger — favslide / liveslide header. */
  iconOnly?: boolean;
  /** Controlled open state — use with hideTrigger for an external toolbar button. */
  open?: boolean;
  /** Hide the default trigger button (toolbar / programmatic open). */
  hideTrigger?: boolean;
  /** Notify parent (e.g. pause slideshow timer while open). */
  onOpenChange?: (open: boolean) => void;
}) {
  const auth = useAuth();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const [view, setView] = useState<AtlasView>("menu");
  const [bias, setBias] = useState<IdeaBias | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AtlasValidateResult | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  useEffect(() => {
    setBias(null);
    setResult(null);
    setError(null);
    setDisclaimer(null);
    setLoading(false);
    setView("menu");
    if (!isControlled) setInternalOpen(false);
    onOpenChange?.(false);
  }, [scope, symbol, onOpenChange, isControlled]);

  const validate = useCallback(
    async (nextBias: IdeaBias, force = false) => {
      if (!force && loading) return;
      setBias(nextBias);
      setView("result");
      setLoading(true);
      setError(null);
      trackCtaClick("atlas_validate_bias", {
        label: nextBias,
        symbol,
        scope,
        bias: nextBias,
      });
      try {
        const idToken = await auth.currentUser?.getIdToken().catch(() => null);
        const res = await fetch("/api/freedombot/levels/atlas/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ scope, symbol, bias: nextBias }),
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          result?: AtlasValidateResult;
          disclaimer?: string;
          error?: string;
        };
        if (!res.ok || !json.result) {
          setResult(null);
          setError(json.error ?? "Atlas couldn't validate this idea right now.");
          return;
        }
        setResult(json.result);
        setDisclaimer(json.disclaimer ?? null);
      } catch {
        setResult(null);
        setError("Network error reaching Atlas. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [scope, symbol, auth, loading],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
      if (next) {
        setView("menu");
        setError(null);
      }
    },
    [isControlled, onOpenChange],
  );

  const displayName = label || symbol;

  return (
    <>
      {!hideTrigger ? (
        <button
          type="button"
          onClick={() => {
            trackCtaClick("atlas_open", { label: ATLAS_LABEL, symbol, scope });
            handleOpenChange(true);
          }}
          className={`fynn-sparkle-btn${open ? " fynn-sparkle-btn-open" : ""} ${
            iconOnly
              ? "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-[1.06] shrink-0"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] shrink-0"
          }`}
          style={{
            color: FNO_ACCENT,
            backgroundColor: "rgba(96,165,250,0.06)",
            border: "1px solid rgba(96,165,250,0.4)",
          }}
          aria-label={`${ATLAS_LABEL} — ${symbol}`}
          title={`${ATLAS_LABEL} — validate your trade idea`}
        >
          <Sparkles
            className={`fynn-sparkle-glow ${iconOnly ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}`}
            strokeWidth={2}
          />
          {!iconOnly ? <span className="whitespace-nowrap">{ATLAS_LABEL}</span> : null}
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/15 pointer-events-none"
          className="fynn-ai-pane w-full sm:max-w-md overflow-y-auto border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        >
          <div className="relative p-5 sm:p-6 pr-12">
            <SheetHeader className="text-left space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                  style={{
                    color: "#bfdbfe",
                    background: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(96,165,250,0.4)",
                  }}
                >
                  <Sparkles className="h-3 w-3 fynn-coach-sparkle" />
                  {ATLAS_LABEL}
                </span>
              </div>
              <SheetTitle className="text-base" style={{ color: FNO_TEXT }}>
                {displayName}
              </SheetTitle>
              <SheetDescription style={{ color: FNO_MUTED }}>
                {view === "menu"
                  ? "I can help validate your trade idea — are you bullish or bearish on this script right now?"
                  : view === "faq"
                    ? "Educational answers about how Atlas reads the data."
                    : "Pressure-test of your stated idea against levels, OI, news, and PVT (daily since zone + intraday)."}
              </SheetDescription>
            </SheetHeader>

            {view !== "menu" ? (
              <button
                type="button"
                onClick={() => {
                  setView("menu");
                  setError(null);
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: FNO_ACCENT }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : null}

            {view === "menu" ? (
              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={() => void validate("bullish")}
                  className="group flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: FNO_CARD_BG,
                    border: "1px solid rgba(52,211,153,0.35)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "rgba(52,211,153,0.14)",
                      border: "1px solid rgba(52,211,153,0.35)",
                    }}
                  >
                    <TrendingUp className="h-4 w-4" style={{ color: "#34d399" }} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold" style={{ color: FNO_TEXT }}>
                      I&apos;m bullish
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: FNO_MUTED }}>
                      Check if support, OI, news, and PVT agree.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void validate("bearish")}
                  className="group flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: FNO_CARD_BG,
                    border: "1px solid rgba(248,113,113,0.35)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "rgba(248,113,113,0.12)",
                      border: "1px solid rgba(248,113,113,0.35)",
                    }}
                  >
                    <TrendingDown className="h-4 w-4" style={{ color: "#f87171" }} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold" style={{ color: FNO_TEXT }}>
                      I&apos;m bearish
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: FNO_MUTED }}>
                      Check if resistance, OI, news, and PVT agree.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    trackCtaClick("atlas_intent_faq", {
                      label: "faq",
                      symbol,
                      scope,
                      intent: "faq",
                    });
                    setView("faq");
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: FNO_CARD_BG,
                    border: "1px solid rgba(96,165,250,0.22)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "rgba(59,130,246,0.14)",
                      border: "1px solid rgba(96,165,250,0.3)",
                    }}
                  >
                    <HelpCircle className="h-4 w-4" style={{ color: FNO_ACCENT }} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold" style={{ color: FNO_TEXT }}>
                      How does this work?
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: FNO_MUTED }}>
                      Short explainers — no validation run.
                    </span>
                  </span>
                </button>

                <p className="pt-1 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
                  You own the idea. Atlas only checks whether the data lines up — not investment
                  advice.
                </p>
              </div>
            ) : view === "faq" ? (
              <AtlasFaqView />
            ) : (
              <div className="mt-4 space-y-4">
                {loading ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl"
                    style={{
                      color: FNO_MUTED,
                      border: "1px solid rgba(96,165,250,0.2)",
                      background: FNO_CARD_BG,
                    }}
                  >
                    <Loader2
                      className="h-7 w-7 animate-spin fynn-coach-sparkle"
                      style={{ color: FNO_ACCENT }}
                    />
                    <p className="text-xs">
                      Checking levels, OI, news, and PVT…
                    </p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <ShieldAlert className="h-7 w-7" style={{ color: "#f87171" }} />
                    <p className="text-xs" style={{ color: "#fca5a5" }}>
                      {error}
                    </p>
                    {bias ? (
                      <button
                        type="button"
                        onClick={() => void validate(bias, true)}
                        className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                        style={{
                          color: FNO_ACCENT,
                          border: "1px solid rgba(96,165,250,0.4)",
                        }}
                      >
                        <RefreshCw className="h-3 w-3" /> Try again
                      </button>
                    ) : null}
                  </div>
                ) : result ? (
                  <ValidateResultView
                    result={result}
                    onRefresh={() => {
                      if (bias) void validate(bias, true);
                    }}
                  />
                ) : null}

                {disclaimer && result && !loading ? (
                  <p className="text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
                    {disclaimer}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AtlasFaqView() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="mt-4 space-y-2">
      {ATLAS_FAQ.map(({ q, a }, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={q}
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: FNO_CARD_BG, border: "1px solid rgba(96,165,250,0.2)" }}
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-[13px] font-semibold" style={{ color: FNO_TEXT }}>
                {q}
              </span>
              {isOpen ? (
                <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: FNO_ACCENT }} />
              ) : (
                <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: FNO_MUTED }} />
              )}
            </button>
            {isOpen ? (
              <p
                className="px-3.5 pb-3.5 -mt-0.5 text-[12px] leading-relaxed"
                style={{ color: "#cbd5e1" }}
              >
                {a}
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="pt-1 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
        These explainers are educational and do not constitute investment advice.
      </p>
    </div>
  );
}

function ValidateResultView({
  result,
  onRefresh,
}: {
  result: AtlasValidateResult;
  onRefresh: () => void;
}) {
  const verdict = VERDICT_STYLE[result.verdict];
  const biasColor = result.bias === "bullish" ? "#34d399" : "#f87171";
  const supports = result.checks.filter((c) => c.status === "support");
  const conflicts = result.checks.filter((c) => c.status === "conflict");
  const neutrals = result.checks.filter((c) => c.status === "neutral");

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
          style={{ color: biasColor, border: `1px solid ${biasColor}55`, backgroundColor: `${biasColor}1a` }}
        >
          Your idea · {result.bias}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-[10px]"
          style={{ color: FNO_MUTED }}
          title="Re-check"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-xl p-3.5" style={CARD_STYLE}>
        <p
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: verdict.color }}
        >
          {verdict.label}
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: FNO_TEXT }}>
          {result.summary}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: FNO_MUTED }}>
          {verdict.blurb}
        </p>
      </div>

      {supports.length > 0 ? (
        <CheckGroup title="Supported by" tone="#34d399" checks={supports} />
      ) : null}
      {conflicts.length > 0 ? (
        <CheckGroup title="Conflicts" tone="#f87171" checks={conflicts} />
      ) : null}
      {neutrals.length > 0 ? (
        <CheckGroup title="Neutral / unavailable" tone={FNO_MUTED} checks={neutrals} />
      ) : null}

      {result.invalidation ? (
        <div
          className="rounded-xl px-3.5 py-3"
          style={{ ...CARD_STYLE, borderColor: "rgba(248,113,113,0.3)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#fca5a5" }}>
            Invalidation
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#cbd5e1" }}>
            {result.invalidation}
          </p>
        </div>
      ) : null}

      {result.caveats.length > 0 ? (
        <div
          className="rounded-xl p-3.5"
          style={{ ...CARD_STYLE, borderColor: "rgba(251,191,36,0.3)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#fcd34d" }}>
            Watch-outs
          </p>
          <ul className="space-y-1">
            {result.caveats.map((c, i) => (
              <li key={i} className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: "#cbd5e1" }}>
                <span style={{ color: "#fcd34d" }}>•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function CheckGroup({
  title,
  tone,
  checks,
}: {
  title: string;
  tone: string;
  checks: AtlasValidateResult["checks"];
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone }}>
        {title}
      </p>
      {checks.map((c) => (
        <div key={c.id} className="rounded-xl px-3.5 py-3" style={CARD_STYLE}>
          <div className="flex items-center gap-2">
            {statusIcon(c.status)}
            <p className="text-[12px] font-semibold" style={{ color: FNO_TEXT }}>
              {c.label}
            </p>
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wide" style={{ color: tone }}>
              {statusLabel(c.status)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#cbd5e1" }}>
            {c.reason}
          </p>
        </div>
      ))}
    </div>
  );
}
