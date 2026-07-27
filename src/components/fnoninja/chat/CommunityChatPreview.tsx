"use client";

import {
  BarChart3,
  Gift,
  ImageIcon,
  Megaphone,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { SUBSCRIBED_CHAT_ROOMS } from "@/lib/chat/constants";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const ROOM_ICONS: Record<string, LucideIcon> = {
  general: MessageSquare,
  charts: BarChart3,
  "pnl-screenshots": ImageIcon,
  offers: Gift,
  announcements: Megaphone,
};

const PREVIEW_MESSAGES = [
  {
    name: "Satish Sharma",
    time: "10:42",
    text: "Booked INR 7380 in $EXIDEIND 400 PUT",
    image: true,
  },
  {
    name: "Rahul K.",
    time: "10:43",
    text: "Nice — was that off the bubble map resistance tag?",
    image: false,
  },
  {
    name: "Satish Sharma",
    time: "10:44",
    text: "Same setup — max pain holding as resistance on the map.",
    image: false,
  },
] as const;

/** Light blur on message bodies only — sidebar + room chrome stay readable. */
const CONTENT_BLUR_CLASS =
  "select-none pointer-events-none blur-[2.5px] opacity-[0.72] saturate-75";

/** Static chat panel mock — sidebar sharp; thread content softly obscured. */
export function CommunityChatPreview({ blurred = true }: { blurred?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        borderColor: FNO_NAV_BORDER,
        backgroundColor: "#0a101c",
        minHeight: "min(72dvh, 640px)",
      }}
      aria-hidden={blurred}
    >
      <div className="flex h-full min-h-[min(72dvh,640px)]">
        {/* Channel sidebar — always sharp */}
        <nav
          className="relative z-20 flex w-[132px] shrink-0 flex-col gap-1 overflow-hidden px-2 py-2"
          style={{ borderRight: `1px solid ${FNO_NAV_BORDER}`, backgroundColor: "rgba(6,12,24,0.6)" }}
          aria-label="Chat channels preview"
        >
          {SUBSCRIBED_CHAT_ROOMS.map((room, i) => {
            const Icon = ROOM_ICONS[room.id] ?? MessageSquare;
            const active = i === 0;
            return (
              <div
                key={room.id}
                className="flex w-full flex-col items-start gap-1 rounded-lg px-2 py-2"
                style={{
                  backgroundColor: active ? "rgba(37,99,235,0.14)" : "transparent",
                  border: active ? "1px solid rgba(96,165,250,0.25)" : "1px solid transparent",
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />
                <span
                  className="w-full break-words text-[10px] font-semibold leading-snug"
                  style={{ color: active ? "#e2e8f0" : "#94a3b8" }}
                >
                  {room.name}
                </span>
                {room.adminOnlyPost ? (
                  <span className="text-[9px] leading-none" style={{ color: "#64748b" }}>
                    {room.allowMemberReplies ? "Replies ok" : "React only"}
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Main thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Room header — sharp */}
          <div
            className="relative z-20 flex items-center justify-between px-4 h-12 shrink-0"
            style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}` }}
          >
            <div>
              <p className="text-sm font-bold text-white">General</p>
              <p className="text-[10px]" style={{ color: "#64748b" }}>
                2 online
              </p>
            </div>
          </div>

          {/* Room info — label sharp, body softly blurred when preview mode */}
          <div
            className="relative shrink-0 px-3 py-2"
            style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}` }}
          >
            <p className="text-[10px] font-semibold" style={{ color: "#94a3b8" }}>
              Rules ▾
            </p>
            {blurred ? (
              <p
                className={`mt-1 text-[10px] leading-relaxed ${CONTENT_BLUR_CLASS}`}
                style={{ color: "#64748b" }}
              >
                Open discussion on F&O market structure, setups, and observations. Not investment
                advice.
              </p>
            ) : (
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
                Open discussion on F&O market structure, setups, and observations. Not investment
                advice.
              </p>
            )}
          </div>

          {/* Messages — shapes visible, text not readable */}
          <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-3">
            <div className={blurred ? `space-y-4 ${CONTENT_BLUR_CLASS}` : "space-y-4"}>
              {PREVIEW_MESSAGES.map((m, idx) => (
                <div key={`${m.time}-${idx}`} className="flex items-start gap-2.5">
                  <div
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #334155, #1e293b)" }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-semibold text-white">{m.name}</span>
                      <span className="text-[10px]" style={{ color: "#64748b" }}>
                        {m.time}
                      </span>
                    </div>
                    {m.image ? (
                      <div
                        className="mt-1.5 h-36 w-full max-w-[280px] rounded-lg"
                        style={{
                          background:
                            "linear-gradient(145deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      />
                    ) : null}
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {blurred ? (
              <div
                className="pointer-events-none absolute inset-0 z-10"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 0%, rgba(8,15,30,0.12) 55%, rgba(8,15,30,0.28) 100%)",
                }}
              />
            ) : null}
          </div>

          {/* Composer — sharp teaser */}
          <div
            className="relative z-20 shrink-0 px-3 py-2.5"
            style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
          >
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: FNO_NAV_BORDER, backgroundColor: "rgba(6,12,24,0.5)" }}
            >
              <span className="flex-1 text-[11px]" style={{ color: "#64748b" }}>
                Share an observation…
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
