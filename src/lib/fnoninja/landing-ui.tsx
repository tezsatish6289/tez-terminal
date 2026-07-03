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

export function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-[#60a5fa] via-[#818cf8] to-[#a78bfa] bg-clip-text text-transparent">
      {children}
    </span>
  );
}

export const LANDING_PRIMARY_CTA =
  "group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#3b82f6] via-[#4f74f8] to-[#6366f1] px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.6)] ring-1 ring-white/10 transition-all hover:shadow-[0_15px_50px_-10px_rgba(99,102,241,0.7)] hover:brightness-110";

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
