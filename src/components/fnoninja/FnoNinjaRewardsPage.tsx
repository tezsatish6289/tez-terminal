"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Gem, Loader2, LogIn, Sparkles } from "lucide-react";
import { useUser } from "@/firebase";
import {
  DIAMONDS_PER_DAY,
  DIAMONDS_PER_QUEST,
  questLabel,
} from "@/lib/fnoninja/rewards-shared";
import {
  fetchRewardsSummary,
  type RewardsApiSummary,
} from "@/lib/fnoninja/rewards-client";
import { fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";
import Link from "next/link";
import { format } from "date-fns";

const FNO_BORDER = "rgba(90,140,220,0.2)";

export function FnoNinjaRewardsPage() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const [data, setData] = useState<RewardsApiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchRewardsSummary(user));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isUserLoading && user) void load();
    if (!isUserLoading && !user) setLoading(false);
  }, [isUserLoading, user, load]);

  if (isUserLoading || (user && loading && !data)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <Gem className="mx-auto mb-4 h-10 w-10 text-sky-400" />
        <h1 className="text-2xl font-black text-white">Rewards</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in to earn diamonds and extend your access.
        </p>
        <Link
          href={fnoLoginHref(pathname, pathname, { src: "rewards", cta: "sign_in" })}
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
        >
          <LogIn className="h-4 w-4" /> Sign in
        </Link>
      </div>
    );
  }

  const quests = data?.quests;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(37,99,235,0.08)" }}
        >
          <Gem className="h-4 w-4 text-[#60a5fa]" />
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Rewards</h1>
          <p className="text-[13px] text-slate-400">
            Earn diamonds. Every {DIAMONDS_PER_DAY} auto-unlocks +1 day of access.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm text-rose-300" style={{ background: "rgba(244,63,94,0.1)" }}>
          {error}
        </p>
      ) : null}

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Diamonds" value={String(data?.diamonds ?? 0)} hint="Current balance" />
        <StatCard
          label="Lifetime earned"
          value={String(data?.diamondsLifetimeEarned ?? 0)}
          hint="All-time diamonds"
        />
        <StatCard
          label="Days extended"
          value={String(data?.rewardsDaysExtended ?? 0)}
          hint="Auto-redeemed so far"
        />
      </div>

      <section
        className="mb-8 rounded-2xl p-5"
        style={{ border: `1px solid ${FNO_BORDER}`, background: "rgba(15,23,42,0.5)" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm font-bold text-white">How it works</h2>
        </div>
        <ul className="space-y-2 text-[13px] leading-relaxed text-slate-300">
          <li>
            Complete simple quests to earn <strong className="text-white">+{DIAMONDS_PER_QUEST} diamonds</strong>.
          </li>
          <li>
            When you hit <strong className="text-white">{DIAMONDS_PER_DAY} diamonds</strong>, we
            automatically extend your access by <strong className="text-white">1 day</strong>.
          </li>
          <li>No redeem button — it happens the moment you earn enough.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold text-white">Quests</h2>
        <div className="space-y-2">
          <QuestRow
            title="Answer F&O experience"
            detail={`+${DIAMONDS_PER_QUEST} · once`}
            done={quests?.fnoExperience.done}
            available={quests?.fnoExperience.available}
          />
          <QuestRow
            title="Send a chat message"
            detail={`+${DIAMONDS_PER_QUEST} · once per day`}
            done={quests?.chatMessage.doneToday}
            available={quests?.chatMessage.available}
          />
          <QuestRow
            title="Share a PnL screenshot"
            detail={`+${DIAMONDS_PER_QUEST} · once per day in PnL room`}
            done={quests?.pnlShare.doneToday}
            available={quests?.pnlShare.available}
          />
          <QuestRow
            title="Welcome a new member"
            detail={`+${DIAMONDS_PER_QUEST} · reply to Atlas welcome · once per person`}
            done={false}
            available={quests?.welcome.available}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-white">Recent activity</h2>
        {!data?.ledger.length ? (
          <p className="text-[13px] text-slate-500">No rewards yet — complete a quest to start.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.ledger.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]"
                style={{ border: `1px solid ${FNO_BORDER}`, background: "rgba(8,15,30,0.6)" }}
              >
                <div>
                  <p className="font-medium text-slate-200">{questLabel(entry.quest)}</p>
                  <p className="text-[11px] text-slate-500">
                    {entry.at ? format(new Date(entry.at), "MMM d, HH:mm") : ""}
                  </p>
                </div>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: entry.type === "redeem" ? "#34d399" : "#38bdf8" }}
                >
                  {entry.type === "redeem"
                    ? `+1 day`
                    : `+${entry.amount}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{ border: `1px solid ${FNO_BORDER}`, background: "rgba(15,23,42,0.5)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function QuestRow({
  title,
  detail,
  done,
  available,
}: {
  title: string;
  detail: string;
  done?: boolean;
  available?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3"
      style={{ border: `1px solid ${FNO_BORDER}`, background: "rgba(8,15,30,0.6)" }}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">{title}</p>
        <p className="text-[11px] text-slate-500">{detail}</p>
      </div>
      {done ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-emerald-300"
          style={{ background: "rgba(16,185,129,0.12)" }}
        >
          <Check className="h-3 w-3" /> Done
        </span>
      ) : available ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-sky-300"
          style={{ background: "rgba(56,189,248,0.12)" }}
        >
          Available
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-slate-500">—</span>
      )}
    </div>
  );
}
