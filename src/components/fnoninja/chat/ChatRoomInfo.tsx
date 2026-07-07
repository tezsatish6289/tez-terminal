"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ChatRoom } from "@/lib/chat/constants";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

/** Room helper text + collapsible rules under the chat header. */
export function ChatRoomInfo({ room }: { room: ChatRoom }) {
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}`, backgroundColor: "rgba(6,12,24,0.35)" }}
    >
      <p className="text-[10px] leading-snug" style={{ color: "#94a3b8" }}>
        {room.description}
      </p>
      <button
        type="button"
        onClick={() => setRulesOpen((o) => !o)}
        className="mt-1.5 flex w-full items-center gap-1 text-left text-[10px] font-semibold transition-colors hover:text-slate-200"
        style={{ color: "#64748b" }}
        aria-expanded={rulesOpen}
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${rulesOpen ? "rotate-180" : ""}`}
        />
        Rules
      </button>
      {rulesOpen ? (
        <ul className="mt-1.5 space-y-1 pl-4 list-disc text-[10px] leading-snug" style={{ color: "#7c8aa0" }}>
          {room.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
