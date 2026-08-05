"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Copy, Share2 } from "lucide-react";
import { useCallback, useState } from "react";
import { trackCtaClick } from "@/firebase/analytics";
import {
  fnoAnalyticsHref,
  fnoLoginHref,
  fnoReplayHref,
  fnoTodayHref,
} from "@/lib/fnoninja/paths";
import type { TodayBoardSnapshot, TodayIndexBoard } from "@/lib/fnoninja/today-board-shared";
import { formatBoardAsOf, formatBoardPrice } from "@/lib/fnoninja/today-board-shared";
import type { SrReplaySummary } from "@/lib/fnoninja/sr-replay-types";
import { FNO_TODAY_TRIAL_CTA } from "@/lib/fnoninja/login-copy";
import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";
import {
  FNO_ACCENT,
  FNO_CARD_BG,
  FNO_CARD_BORDER,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

function IndexCard({ row }: { row: TodayIndexBoard }) {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 min-w-0"
      style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">{row.label}</h2>
        <span className="text-sm font-semibold tabular-nums" style={{ color: FNO_MUTED }}>
          Spot {formatBoardPrice(row.spot)}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#4ade80" }}>
            Put wall
          </dt>
          <dd className="text-lg sm:text-xl font-black tabular-nums text-white">
            {formatBoardPrice(row.putWall)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#fbbf24" }}>
            Max pain
          </dt>
          <dd className="text-lg sm:text-xl font-black tabular-nums text-white">
            {formatBoardPrice(row.maxPain)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#f87171" }}>
            Call wall
          </dt>
          <dd className="text-lg sm:text-xl font-black tabular-nums text-white">
            {formatBoardPrice(row.callWall)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function FnoNinjaTodayBoard({
  board,
  replays,
}: {
  board: TodayBoardSnapshot;
  replays: SrReplaySummary[];
}) {
  const pathname = usePathname();
  const todayHref = fnoTodayHref(pathname);
  const levelsHref = fnoAnalyticsHref(pathname);
  const loginHref = fnoLoginHref(pathname, levelsHref, { src: "today", cta: "today_trial" });
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${todayHref}`
      : `https://fnoninja.com/today`;

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackCtaClick("today_copy_link", { href: shareUrl });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, [shareUrl]);

  const onShare = useCallback(async () => {
    trackCtaClick("today_share", { href: shareUrl });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "FNO Ninja — levels today",
          text: "Nifty & Bank Nifty option walls board",
          url: shareUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      await onCopy();
    }
  }, [onCopy, shareUrl]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14 min-w-0">
      <p
        className="text-xs font-bold uppercase tracking-widest mb-3"
        style={{ color: FNO_ACCENT }}
      >
        Levels today
      </p>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
        Nifty &amp; Bank Nifty walls
      </h1>
      <p className="text-sm sm:text-base mb-2" style={{ color: "#94a3b8" }}>
        A simple pre-market board — put wall, call wall, and max pain. Educational only; not
        investment advice.
      </p>
      <p className="text-xs mb-8" style={{ color: FNO_MUTED }}>
        As of {formatBoardAsOf(board.updatedAt)}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {board.indices.map((row) => (
          <IndexCard key={row.symbol} row={row} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-12">
        <Link
          href={loginHref}
          onClick={() => trackCtaClick("today_trial_cta", { href: loginHref })}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
          style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
        >
          {FNO_TODAY_TRIAL_CTA}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => void onShare()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border transition-colors hover:bg-white/[0.04]"
          style={{ borderColor: "rgba(90,140,220,0.28)", color: "#93c5fd" }}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border transition-colors hover:bg-white/[0.04]"
          style={{ borderColor: "rgba(90,140,220,0.28)", color: FNO_MUTED }}
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      {replays.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-white mb-1">Recent wall stories</h2>
          <p className="text-sm mb-4" style={{ color: FNO_MUTED }}>
            Completed moves where a wall held — educational recaps.
          </p>
          <ul className="space-y-2">
            {replays.map((r) => {
              const href = fnoReplayHref(pathname, r.id);
              return (
                <li key={r.id}>
                  <Link
                    href={href}
                    onClick={() => trackCtaClick("today_replay_link", { story_id: r.id, href })}
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.04]"
                    style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.45)" }}
                  >
                    <span className="text-sm font-semibold text-white min-w-0 truncate">
                      {r.title}
                    </span>
                    <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: "#4ade80" }}>
                      +{r.movePct.toFixed(1)}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed" style={{ color: FNO_MUTED }}>
        Full F&amp;O stock map, alerts, and Atlas unlock with a {FNONINJA_FREE_TRIAL_DAYS}-day free
        trial.{" "}
        <Link href={levelsHref} className="underline underline-offset-2" style={{ color: "#93c5fd" }}>
          Preview the market map
        </Link>
        .
      </p>
    </div>
  );
}
