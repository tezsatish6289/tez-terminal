/** Client-safe helpers for posting trial activity (no server-only imports). */

import type { TrialActivityType } from "@/lib/fnoninja/trial-activity-types";

export type { TrialActivityType } from "@/lib/fnoninja/trial-activity-types";

async function authHeaders(user: { getIdToken: () => Promise<string> }) {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Best-effort POST — never throws. Dedupes first-hit types per tab via sessionStorage. */
export async function postTrialActivity(
  user: { getIdToken: () => Promise<string> } | null | undefined,
  type: TrialActivityType,
  meta: Record<string, unknown> = {},
  opts: { oncePerSession?: boolean } = {},
): Promise<void> {
  if (!user) return;
  const once = opts.oncePerSession !== false;
  if (once && typeof sessionStorage !== "undefined") {
    const key = `fno_trial_activity_${type}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }
  try {
    const headers = await authHeaders(user);
    await fetch("/api/fnoninja/activity", {
      method: "POST",
      headers,
      body: JSON.stringify({ type, meta }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
