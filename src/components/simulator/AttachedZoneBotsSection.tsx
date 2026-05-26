"use client";

/**
 * Crypto Bot ↔ Zone Bot silent attach controls.
 *
 * Renders only inside the Crypto Bot config sheet. Four dropdowns
 * (BTC / ETH / SOL / XRP) — each `off | sim | live` — drive
 * `config/sim_bot_crypto_settings.attachedZoneBots`. Wired through
 * the dedicated admin endpoint `/api/admin/crypto-bot-attach` (defined
 * in `src/app/api/admin/crypto-bot-attach/route.ts`) which validates
 * input and self-heals legacy garbage from a buggy older write path.
 *
 * Behaviour is gated by the decision engine in PR 2; today flipping
 * any mode here just persists the value with no observable effect.
 * The section is rendered behind admin-email gating so non-admins
 * never see it.
 */
import { useCallback, useEffect, useState } from "react";
import { Layers, Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { cn } from "@/lib/utils";

type AttachMode = "off" | "sim" | "live";
type ZoneAsset = "btc" | "eth" | "sol" | "xrp";
type AttachedMap = Record<ZoneAsset, AttachMode>;

const ZONE_ORDER: readonly ZoneAsset[] = ["btc", "eth", "sol", "xrp"] as const;
const ZONE_LABEL: Record<ZoneAsset, string> = {
  btc: "Bitcoin Bot",
  eth: "Ethereum Bot",
  sol: "Solana Bot",
  xrp: "XRP Bot",
};
const MODES: readonly AttachMode[] = ["off", "sim", "live"] as const;
const MODE_LABEL: Record<AttachMode, string> = {
  off: "Off",
  sim: "Sim",
  live: "Live",
};
const MODE_HINT: Record<AttachMode, string> = {
  off: "Zone bot operates standalone. No effect on Crypto Bot.",
  sim:
    "Trade appears in Crypto Bot records (with on-chain link) but no live execution for Crypto subscribers.",
  live:
    "Trade appears in Crypto Bot records AND fires for Crypto Bot subscribers (with dedup, symbol guard, Crypto cap).",
};

const DEFAULT_MAP: AttachedMap = { btc: "off", eth: "off", sol: "off", xrp: "off" };

function readMap(raw: unknown): AttachedMap {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MAP };
  const r = raw as Partial<Record<ZoneAsset, unknown>>;
  const out: AttachedMap = { ...DEFAULT_MAP };
  for (const asset of ZONE_ORDER) {
    const v = r[asset];
    if (v === "live" || v === "sim" || v === "off") out[asset] = v;
  }
  return out;
}

function mapsEqual(a: AttachedMap, b: AttachedMap): boolean {
  return ZONE_ORDER.every((k) => a[k] === b[k]);
}

export function AttachedZoneBotsSection() {
  const { user } = useUser();
  const isAdmin = isAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMap, setSavedMap] = useState<AttachedMap>({ ...DEFAULT_MAP });
  const [draftMap, setDraftMap] = useState<AttachedMap>({ ...DEFAULT_MAP });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/crypto-bot-attach", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { attachedZoneBots?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const m = readMap(data.attachedZoneBots);
      setSavedMap(m);
      setDraftMap(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attach config");
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !mapsEqual(savedMap, draftMap);

  const save = useCallback(async () => {
    if (!user || !isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/crypto-bot-attach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(draftMap),
      });
      const data = (await res.json()) as {
        attachedZoneBots?: unknown;
        rejected?: { asset: string; reason: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const next = readMap(data.attachedZoneBots);
      setSavedMap(next);
      setDraftMap(next);
      setSavedAt(Date.now());
      if (data.rejected && data.rejected.length > 0) {
        setError(
          `Some values were rejected: ${data.rejected
            .map((r) => `${r.asset} (${r.reason})`)
            .join(", ")}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [user, isAdmin, draftMap]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-accent/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
          Attached zone bots
        </span>
      </div>
      <p className="text-[9px] text-muted-foreground/55 leading-relaxed">
        Silently bundle zone bots into Crypto Bot. <span className="text-amber-300/80 font-bold">Sim</span> publishes
        the zone bot&apos;s trades under Crypto Bot records (with on-chain proof) but
        does <span className="font-bold">not</span> fire live trades for Crypto subscribers.{" "}
        <span className="text-emerald-300/80 font-bold">Live</span> does both. Solo
        subscribers of a zone bot always win — they get exactly one fill via the
        solo path. PR 1 plumbing only — flipping has no behavioural effect until
        the decision engine ships.
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-accent/50" />
        </div>
      ) : (
        <div className="space-y-2">
          {ZONE_ORDER.map((asset) => (
            <div
              key={asset}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-white/[0.04] bg-white/[0.01]"
            >
              <span className="text-[11px] font-bold text-foreground/85 shrink-0 w-[110px] truncate">
                {ZONE_LABEL[asset]}
              </span>
              <div className="flex gap-1 shrink-0">
                {MODES.map((mode) => {
                  const active = draftMap[asset] === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        setDraftMap((m) => ({ ...m, [asset]: mode }))
                      }
                      title={MODE_HINT[mode]}
                      className={cn(
                        "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border transition-all",
                        active
                          ? mode === "off"
                            ? "bg-white/[0.06] border-white/[0.12] text-foreground/70"
                            : mode === "sim"
                              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                              : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                          : "border-white/[0.06] text-muted-foreground/45 hover:bg-white/[0.04]",
                      )}
                    >
                      {MODE_LABEL[mode]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[10px] text-rose-300/90 leading-relaxed">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {savedAt && !dirty && !error && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <CheckCircle2 className="w-3 h-3" />
          <span>Saved</span>
        </div>
      )}

      <button
        type="button"
        disabled={!dirty || saving || loading}
        onClick={() => void save()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent/90 text-black text-[10px] font-black uppercase tracking-wider disabled:opacity-30 hover:bg-accent transition-all"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        Save attach config
      </button>
    </div>
  );
}
