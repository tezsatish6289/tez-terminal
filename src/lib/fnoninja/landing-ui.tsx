"use client";

import { useEffect, useState } from "react";

export const FNO_LANDING_BORDER = "rgba(90,140,220,0.18)";

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#60a5fa]">
      {children}
    </p>
  );
}

export function GradientText({
  children,
  animated = false,
}: {
  children: React.ReactNode;
  /** Soft flowing gradient (hero accents). Falls back under prefers-reduced-motion. */
  animated?: boolean;
}) {
  return (
    <span className={animated ? "fno-gradient-flow" : "text-[#60a5fa]"}>
      {children}
    </span>
  );
}

export const LANDING_PRIMARY_CTA =
  "inline-flex items-center gap-2 rounded-xl bg-[#3b82f6] px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#2563eb]";

export const LANDING_PRIMARY_CTA_SM =
  "inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#2563eb]";

export const LANDING_SHIMMER =
  "pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full";

export function useWebinarStats(pollMs = 60_000): number | null {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fnoninja/webinar/stats", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { total?: number };
        if (alive && typeof json.total === "number") setTotal(json.total);
      } catch {
        /* silent */
      }
    };
    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [pollMs]);
  return total;
}

export type WebinarRegisterResponse = {
  success: true;
  sessionDate: string;
  youtubeWatchUrl: string | null;
  calendarInvite: boolean;
};

export async function registerForWebinar(input: {
  name: string;
  email: string;
  mobile: string;
  sessionDate?: string;
  source?: string;
}): Promise<WebinarRegisterResponse> {
  const res = await fetch("/api/fnoninja/webinar/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { success?: boolean; error?: string } & Partial<WebinarRegisterResponse>;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Registration failed (${res.status})`);
  }
  return json as WebinarRegisterResponse;
}
