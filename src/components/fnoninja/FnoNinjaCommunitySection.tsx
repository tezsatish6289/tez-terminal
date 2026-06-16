"use client";

import { Fragment, useEffect, useState } from "react";
import { ArrowRight, Hash, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { useUser } from "@/firebase";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { GENERAL_ROOM_ID } from "@/lib/chat/constants";
import { fnoAnalyticsHref } from "@/lib/fnoninja/paths";
import { usePathname } from "next/navigation";
import {
  FNO_ACCENT,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_LOGO_MARK,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

interface PreviewMessage {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

// Observation-only examples shown before the live feed loads (or if it's empty),
// so the preview never looks broken. Deliberately not trade calls.
const SAMPLE_MESSAGES: PreviewMessage[] = [
  { id: "s1", name: "Aarav", text: "$BANKNIFTY still holding above the max-pain zone — structure looks stable.", createdAt: 0 },
  { id: "s2", name: "Priya", text: "Heavy OI build near $NIFTY 23500. Watching how it resolves.", createdAt: 0 },
  { id: "s3", name: "Rohan", text: "Anyone tracking the shift in $RELIANCE zones this week?", createdAt: 0 },
];

const BULLETS: { icon: typeof MessageCircle; title: string; body: string }[] = [
  {
    icon: MessageCircle,
    title: "Discuss with real F&O traders",
    body: "A focused, subscriber-only room — share what you're seeing in market structure, not noise.",
  },
  {
    icon: Hash,
    title: "Tag any symbol with $NIFTY",
    body: "Cashtags link straight to that symbol's chart, so others can open the exact view you mean.",
  },
  {
    icon: Users,
    title: "See who's around",
    body: "Live presence shows how many members are active right now.",
  },
  {
    icon: ShieldCheck,
    title: "Moderated & compliant",
    body: "Observations only — never buy/sell tips. Reported messages are reviewed by moderators.",
  },
];

function highlightCashtags(text: string) {
  const parts = text.split(/(\$[A-Z][A-Z0-9&-]{1,19}\b)/g);
  return parts.map((part, i) =>
    /^\$[A-Z]/.test(part) ? (
      <span key={i} className="font-semibold" style={{ color: FNO_ACCENT }}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function ChatPreview() {
  const [messages, setMessages] = useState<PreviewMessage[]>(SAMPLE_MESSAGES);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/preview")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { messages?: PreviewMessage[] } | null) => {
        if (active && data?.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ backgroundColor: "#0b1322", border: "1px solid rgba(90,140,220,0.16)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(90,140,220,0.12)" }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" style={{ color: FNO_ACCENT }} />
          <span className="text-sm font-bold text-white">#General</span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#10b981" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#10b981" }} />
          Subscribers
        </span>
      </div>

      {/* Messages */}
      <div className="space-y-3 px-4 py-4">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: FNO_LOGO_MARK }}
            >
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white">{m.name}</span>
              <p className="mt-0.5 text-[13px] leading-relaxed break-words" style={{ color: "#cbd5e1" }}>
                {highlightCashtags(m.text)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Fade + disclaimer */}
      <div
        className="px-4 py-2 text-[11px] leading-snug"
        style={{
          backgroundColor: "rgba(148,163,184,0.06)",
          borderTop: "1px solid rgba(148,163,184,0.12)",
          color: "#94a3b8",
        }}
      >
        User opinions only — not investment advice.
      </div>
    </div>
  );
}

function CommunityCta() {
  const { user } = useUser();
  const pathname = usePathname();
  const { setOpen, setRoomId } = useChatPanel();

  const openChat = () => {
    setRoomId(GENERAL_ROOM_ID);
    setOpen(true);
  };

  if (!user) {
    return (
      <FnoNinjaGoogleSignInButton
        size="hero"
        label="Join the community"
        showGoogleIcon={false}
        postSignInHref={fnoAnalyticsHref(pathname)}
        onSignedIn={openChat}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={openChat}
      className="inline-flex items-center justify-center gap-2.5 rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
      style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
    >
      Join the community
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

export function FnoNinjaCommunitySection() {
  return (
    <section id="community" className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="max-w-xl">
          <p
            className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] sm:text-xs"
            style={{ color: FNO_ACCENT }}
          >
            Community
          </p>
          <h2 className="text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            Think out loud with other traders.
          </h2>
          <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: FNO_MUTED }}>
            Every subscription includes the FNONINJA community chat — a live, moderated room to
            compare notes on F&amp;O market structure with traders reading the same data you are.
          </p>

          <ul className="mt-8 space-y-5">
            {BULLETS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: FNO_LOGO_MARK }}
                >
                  <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <CommunityCta />
            <p className="mt-3 text-[11px]" style={{ color: "#475569" }}>
              Included with your trial or subscription — no separate purchase.
            </p>
          </div>
        </div>

        <div className="lg:pl-4">
          <ChatPreview />
        </div>
      </div>
    </section>
  );
}
