"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Share2 } from "lucide-react";
import { useCallback } from "react";
import { SrStoryReplayCanvas } from "@/components/sr-audit/SrStoryReplayCanvas";
import { trackCtaClick } from "@/firebase/analytics";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import {
  fnoAnalyticsHref,
  fnoLoginHref,
  fnoReplayHref,
  fnoTodayHref,
} from "@/lib/fnoninja/paths";
import type { SrReplaySummary } from "@/lib/fnoninja/sr-replay-types";
import { FNO_REPLAY_TRIAL_CTA } from "@/lib/fnoninja/login-copy";
import {
  FNO_CARD_BORDER,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export function FnoNinjaReplayPage({
  id,
  title,
  replay,
  related,
}: {
  id: string;
  title: string;
  replay: StoryReplayData;
  related: SrReplaySummary[];
}) {
  const pathname = usePathname();
  const todayHref = fnoTodayHref(pathname);
  const levelsHref = fnoAnalyticsHref(pathname);
  const loginHref = fnoLoginHref(pathname, levelsHref, { src: "replay", cta: "replay_trial" });
  const sharePath = fnoReplayHref(pathname, id);

  const setup =
    replay.side === "support"
      ? "Put-wall bounce (support held)"
      : "Call-wall rejection (resistance held)";

  const onShare = useCallback(async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${sharePath}`
        : `https://fnoninja.com/replay/${encodeURIComponent(id)}`;
    trackCtaClick("replay_share", { story_id: id, href: url });
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
    }
  }, [id, sharePath, title]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14 min-w-0">
      <Link
        href={todayHref}
        className="text-xs font-bold uppercase tracking-widest mb-4 inline-block hover:text-white"
        style={{ color: FNO_MUTED }}
      >
        ← Levels today
      </Link>

      <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">{title}</h1>
      <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>
        {setup}. Educational recap only — not investment advice.
      </p>

      <div
        className="relative aspect-[9/16] w-full max-h-[min(70vh,560px)] overflow-hidden rounded-2xl mb-5"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
      >
        <SrStoryReplayCanvas
          data={replay}
          active
          autoPlay
          loop
          showControls
          className="h-full"
        />
      </div>

      <p className="text-sm leading-relaxed mb-6" style={{ color: "#cbd5e1" }}>
        Entered near ₹{fmt(replay.entrySpot)}
        {replay.maxPain != null ? ` → max pain ₹${fmt(replay.maxPain)}` : ""}. Peak move (MFE) +
        {replay.movePct.toFixed(1)}%.
      </p>

      <div className="flex flex-wrap gap-3 mb-10">
        <Link
          href={loginHref}
          onClick={() => trackCtaClick("replay_trial_cta", { story_id: id, href: loginHref })}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
        >
          {FNO_REPLAY_TRIAL_CTA}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => void onShare()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border"
          style={{ borderColor: "rgba(90,140,220,0.28)", color: "#93c5fd" }}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <Link
          href={todayHref}
          onClick={() => trackCtaClick("replay_to_today", { href: todayHref })}
          className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ color: FNO_MUTED }}
        >
          Today&apos;s board
        </Link>
      </div>

      {related.length > 0 ? (
        <section>
          <h2 className="text-sm font-bold text-white mb-3">More stories</h2>
          <ul className="space-y-2">
            {related.map((r) => {
              const href = fnoReplayHref(pathname, r.id);
              return (
                <li key={r.id}>
                  <Link
                    href={href}
                    className="block rounded-xl px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/[0.04] truncate"
                    style={{ border: FNO_CARD_BORDER }}
                  >
                    {r.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
