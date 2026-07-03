"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useUser } from "@/firebase";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { fnoCommunityChatHref, fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNO_LANDING_FOLD_CLASS } from "@/lib/fnoninja/responsive";
import {
  FNO_ACCENT,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_LOGO_MARK,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

interface StaticMessage {
  id: string;
  name: string;
  text: string;
}

const STATIC_MESSAGES: StaticMessage[] = [
  { id: "1", name: "Neha", text: "Anyone tracking L&T today?" },
  { id: "2", name: "Rahul", text: "Yep. Sitting right below a massive Call Cluster. Not looking very strong." },
  { id: "3", name: "Ankit", text: "Saw the same on FNO Ninja. The bubble map highlighted it immediately." },
  {
    id: "4",
    name: "Priya",
    text: "I love how easy it is to spot these levels. Much faster than scanning option chains manually.",
  },
  { id: "5", name: "Rahul", text: "Exactly. One glance and you know where traders are heavily positioned." },
  {
    id: "6",
    name: "Neha",
    text: "I'm watching ₹4,150 closely. If it gets rejected again, bears might stay in control.",
  },
  {
    id: "7",
    name: "Ankit",
    text: "The slideshow feature is underrated. Found 3-4 interesting setups in less than 5 minutes.",
  },
  { id: "8", name: "Vikram", text: "Same. Discovered a couple of stocks I wasn't even tracking before." },
  {
    id: "9",
    name: "Priya",
    text: "That's the biggest advantage for me. It's more of a market discovery tool than a charting tool.",
  },
  { id: "10", name: "Neha", text: "Agreed. Helps me find opportunities first, then I do my own analysis." },
];

const CHECKLIST = [
  "Real traders",
  "No signals",
  "Instant chart sharing",
  "Subscriber only",
] as const;

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

/** Static chat thread with slow auto-scroll so visitors feel the live-room rhythm. */
function ChatPreview() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    let pauseUntil = 0;

    const tick = () => {
      const now = Date.now();
      if (now < pauseUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll > 0) {
        if (el.scrollTop >= maxScroll - 2) {
          pauseUntil = now + 2500;
          el.scrollTop = 0;
        } else {
          el.scrollTop += 0.45;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ backgroundColor: "#0b1322", border: "1px solid rgba(90,140,220,0.16)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(90,140,220,0.12)" }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" style={{ color: FNO_ACCENT }} />
          <span className="text-sm font-bold text-white">#General</span>
        </div>
        <span
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "#64748b" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#64748b" }} />
          Sample chat
        </span>
      </div>

      <div className="relative" style={{ height: "min(22rem, 52vw)" }}>
        <div
          ref={scrollRef}
          className="h-full overflow-hidden px-4 py-4"
          aria-hidden
        >
          <div className="space-y-3">
            {STATIC_MESSAGES.map((m) => (
              <div key={m.id} className="flex gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: FNO_LOGO_MARK }}
                >
                  {m.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-white">{m.name}</span>
                  <p
                    className="mt-0.5 text-[13px] leading-relaxed break-words"
                    style={{ color: "#cbd5e1" }}
                  >
                    {highlightCashtags(m.text)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Soft fades so the scroll feels like a live window */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-8"
          style={{ background: "linear-gradient(to bottom, #0b1322, transparent)" }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{ background: "linear-gradient(to top, #0b1322, transparent)" }}
        />
      </div>

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
  const router = useRouter();
  const href = fnoCommunityChatHref(pathname);

  if (!user) {
    return (
      <Link
        href={fnoLoginHref(pathname, href)}
        className="inline-flex items-center justify-center gap-2.5 rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
        style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
      >
        Join the community
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
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
    <section
      id="community"
      className={`${FNO_LANDING_SHELL} ${FNO_LANDING_FOLD_CLASS} flex flex-col py-10 sm:py-12 lg:py-14`}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-xl">
            <p
              className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] sm:text-xs"
              style={{ color: FNO_ACCENT }}
            >
              Community
            </p>
            <h2 className="text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              We understand trading alone is hard, that&apos;s why we built a community.
            </h2>
            <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: FNO_MUTED }}>
              Join a private room where traders discuss market structure, option clusters, and setups
              using the same FNO Ninja data.
            </p>

            <ul className="mt-6 space-y-2">
              {CHECKLIST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm font-medium text-white"
                >
                  <span aria-hidden style={{ color: "#34d399" }}>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <CommunityCta />
            </div>
          </div>

          <div className="lg:pl-4">
            <ChatPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
