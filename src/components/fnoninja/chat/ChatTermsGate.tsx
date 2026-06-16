"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { useUser } from "@/firebase";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

/** First-visit terms acceptance before a user can post. */
export function ChatTermsGate({ onAccepted }: { onAccepted: () => void }) {
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/chat/accept-terms", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Could not save your acceptance. Try again.");
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
      >
        <MessageSquare className="h-5 w-5" style={{ color: "#60a5fa" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Welcome to the community</p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
          This is a space for discussing F&amp;O market structure. Everything here is{" "}
          <strong>informational only and not investment advice</strong>. Do not post buy/sell calls,
          tips, or solicitations. Be respectful — abuse and spam lead to a ban.
        </p>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={submitting}
        className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-60"
        style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        I understand &amp; agree
      </button>
    </div>
  );
}
