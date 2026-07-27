"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useUser } from "@/firebase";
import { trackCtaClick } from "@/firebase/analytics";
import {
  fadeLeft,
  fadeRight,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/fnoninja/landing-motion";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { fnoCommunityChatHref, fnoCommunityHref } from "@/lib/fnoninja/paths";
import {
  FNO_LANDING_BORDER,
  GradientText,
  LANDING_PRIMARY_CTA,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const CHAT = [
  { i: "N", n: "Neha", m: "Anyone tracking L&T today?", t: "10:42", tone: "slate" as const },
  { i: "R", n: "Rahul", m: "Yep. Sitting right below a massive Call Cluster.", t: "10:43", tone: "rose" as const },
  { i: "A", n: "Ankit", m: "Bubble map caught it instantly.", t: "10:44", tone: "sky" as const },
  { i: "P", n: "Priya", m: "Way faster than scanning option chains manually.", t: "10:45", tone: "violet" as const },
] as const;

const CHECKLIST = [
  "Real traders",
  "No signals",
  "Instant chart sharing",
  "Subscriber only",
] as const;

function ChatPreview() {
  const toneClass = useMemo(
    () => ({
      slate: "from-slate-500/40 to-slate-700/40 text-slate-100 ring-slate-400/30",
      rose: "from-slate-500/40 to-slate-700/40 text-slate-100 ring-slate-400/30",
      sky: "from-slate-500/40 to-slate-700/40 text-slate-100 ring-slate-400/30",
      violet: "from-slate-500/40 to-slate-700/40 text-slate-100 ring-slate-400/30",
    }),
    [],
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-[#0d1830]/70 shadow-lg backdrop-blur"
      style={{ borderColor: FNO_LANDING_BORDER }}
    >
      <div
        className="flex items-center justify-between border-b px-3.5 py-2.5"
        style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.4)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500">#</span>
          <span className="text-[13px] font-semibold text-white">general</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          128 online
        </span>
      </div>

      <Stagger className="space-y-2.5 px-3.5 py-3.5">
        {CHAT.map((c) => (
          <StaggerItem key={`${c.n}-${c.t}`} className="flex items-start gap-2.5">
            <div
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold ring-1 ${toneClass[c.tone]}`}
            >
              {c.i}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-semibold text-white">{c.n}</span>
                <span className="text-[10px] text-slate-500">{c.t}</span>
              </div>
              <div className="mt-0.5 inline-block rounded-lg rounded-tl-sm bg-white/[0.03] px-2.5 py-1 text-[12px] leading-snug text-slate-300 ring-1 ring-white/[0.04]">
                {c.m}
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <div
        className="border-t px-3.5 py-2.5"
        style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(8,15,30,0.4)" }}
      >
        <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}>
          <span className="text-slate-500">+</span>
          <span className="flex-1 text-[11px] text-slate-500">Message #general</span>
          <span className="rounded-md bg-[#3b82f6]/20 px-2 py-0.5 text-[10px] font-semibold text-[#60a5fa]">↵</span>
        </div>
      </div>
    </div>
  );
}

function CommunityCta() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const communityHref = fnoCommunityHref(pathname);
  const chatHref = fnoCommunityChatHref(pathname);

  if (!user) {
    return (
      <Link
        href={communityHref}
        onClick={() => trackCtaClick("join_community", { label: "Join the community" })}
        className={LANDING_PRIMARY_CTA}
      >
        Join the community
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        trackCtaClick("join_community", { label: "Join the community" });
        router.push(chatHref);
      }}
      className={LANDING_PRIMARY_CTA}
    >
      Join the community
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

export function FnoNinjaCommunitySection() {
  return (
    <section id="community" className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <Reveal variants={fadeLeft} className="max-w-xl">
          <SectionEyebrow>Community</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            Discuss structure <GradientText>with serious traders.</GradientText>
          </h2>
          <p className="mt-4 text-sm leading-relaxed sm:text-base text-slate-400">
            A private room for subscribers. Same data, real conversations.
          </p>

          <ul className="mt-7 grid grid-cols-2 gap-3 text-sm">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-slate-300">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[11px] font-semibold text-[#60a5fa]">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CommunityCta />
            <span className="text-xs text-slate-500">User opinions only — not investment advice.</span>
          </div>
        </Reveal>

        <Reveal variants={fadeRight} className="lg:pl-4">
          <ChatPreview />
        </Reveal>
      </div>
    </section>
  );
}
