"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, Megaphone } from "lucide-react";
import { useUser } from "@/firebase";
import { fnoAffiliateHref, fnoAffiliateMaterialsHref, fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNONINJA_TRIAL_WITH_REFERRAL_DAYS } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

const FNO_BORDER = "rgba(90,140,220,0.2)";

type MaterialsData = {
  referralCode: string;
  referralLink: string;
};

type MaterialItem = {
  id: string;
  label: string;
  channel: string;
  body: string;
};

function buildMaterials(code: string, link: string): MaterialItem[] {
  const trial = FNONINJA_TRIAL_WITH_REFERRAL_DAYS;
  return [
    {
      id: "whatsapp",
      label: "WhatsApp / friends",
      channel: "Chat",
      body: `Hey — I've been using FNO Ninja for Nifty/Bank Nifty levels and market maps. You get ${trial} days free if you sign up with my link:\n\n${link}\n\nOr after Google sign-in, enter code ${code}.`,
    },
    {
      id: "short",
      label: "Short share",
      channel: "Any",
      body: `Try FNO Ninja free for ${trial} days → ${link}`,
    },
    {
      id: "twitter",
      label: "X / Twitter",
      channel: "Social",
      body: `Live option levels + market maps for F&O traders.\n\nGet ${trial} days free with my invite:\n${link}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn / Instagram",
      channel: "Caption",
      body: `If you trade Indian F&O, FNO Ninja is worth a look — live levels, zone maps, and a clean workflow for Nifty/Bank Nifty.\n\nUse my invite for ${trial} free trial days:\n${link}\n\nCode (after Google sign-in): ${code}`,
    },
    {
      id: "code",
      label: "Code only",
      channel: "In-person",
      body: `After you sign in to FNO Ninja with Google, enter referral code ${code} for ${trial} trial days.`,
    },
  ];
}

export function FnoNinjaAffiliateMaterialsPage() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const [data, setData] = useState<MaterialsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const affiliateHref = fnoAffiliateHref(pathname);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/affiliate/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as MaterialsData & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData({ referralCode: json.referralCode, referralLink: json.referralLink });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, load]);

  const items = useMemo(
    () => (data ? buildMaterials(data.referralCode, data.referralLink) : []),
    [data],
  );

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href={affiliateHref}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Refer & Earn
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(37,99,235,0.08)" }}
        >
          <Megaphone className="h-4 w-4 text-[#60a5fa]" />
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Promotional material
          </h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Copy ready-to-share messages with your link already filled in. Paste into WhatsApp,
            social, or email.
          </p>
        </div>
      </div>

      {isUserLoading || (user && loading) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#60a5fa]" />
        </div>
      ) : !user ? (
        <div
          className="rounded-2xl p-5"
          style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(8,16,36,0.65)" }}
        >
          <p className="text-sm text-slate-300">Sign in to get personalized promotional copy.</p>
          <Link
            href={fnoLoginHref(pathname, fnoAffiliateMaterialsHref(pathname))}
            className="mt-4 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Sign in
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-3">
          <div
            className="rounded-2xl px-4 py-3 text-[12px] text-slate-400"
            style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(8,16,36,0.65)" }}
          >
            Your link:{" "}
            <span className="font-mono text-[#93c5fd]">{data.referralLink}</span>
            <span className="mx-2 text-slate-600">·</span>
            Code: <span className="font-mono text-slate-300">{data.referralCode}</span>
          </div>

          {items.map((item) => {
            const isCopied = copiedId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-2xl p-4 sm:p-5"
                style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(8,16,36,0.65)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {item.channel}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-white">{item.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy(item.id, item.body)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    style={{ background: FNO_CTA_GRADIENT }}
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {isCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 px-3 py-3 font-sans text-[13px] leading-relaxed text-slate-300">
                  {item.body}
                </pre>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
