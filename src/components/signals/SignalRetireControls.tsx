"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type SidePreview = {
  active: number;
  inUse: number;
  eligible: number;
};

/**
 * Admin retire controls on /signals — retires ACTIVE bull/bear signals that
 * are not linked to any open sim or live trade.
 */
export function SignalRetireControls({
  assetType,
  onRetired,
}: {
  assetType: "CRYPTO" | "INDIAN_STOCKS";
  onRetired?: () => void;
}) {
  const { user } = useUser();
  const [bull, setBull] = useState<SidePreview | null>(null);
  const [bear, setBear] = useState<SidePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmSide, setConfirmSide] = useState<"bull" | "bear" | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const q = `assetType=${encodeURIComponent(assetType)}`;
      const [bullRes, bearRes] = await Promise.all([
        fetch(`/api/admin/signal-retire?side=bull&${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/signal-retire?side=bear&${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (bullRes.status === 403 || bullRes.status === 401) {
        setBull(null);
        setBear(null);
        return;
      }
      if (bullRes.ok) setBull(await bullRes.json());
      if (bearRes.ok) setBear(await bearRes.json());
    } catch {
      setBull(null);
      setBear(null);
    } finally {
      setLoading(false);
    }
  }, [user, assetType]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRetire = useCallback(
    async (side: "bull" | "bear") => {
      if (!user) return;
      setSaving(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/signal-retire", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ side, assetType }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? res.statusText);

        toast({
          title: `${side === "bull" ? "Bull" : "Bear"} signals retired`,
          description:
            data.retired > 0
              ? `${data.retired} retired · ${data.inUse} kept (open sim/live)`
              : "No unused signals to retire",
        });
        await load();
        onRetired?.();
      } catch (e: unknown) {
        toast({
          title: "Retire failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
        setConfirmSide(null);
      }
    },
    [user, assetType, load, onRetired],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/45">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  if (!bull && !bear) return null;

  const preview = confirmSide === "bull" ? bull : bear;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1.5 lg:gap-2 px-2.5 py-1.5 rounded-lg border",
          "border-white/10 bg-white/[0.03]",
        )}
      >
        <Archive className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 hidden sm:block" />
        <RetireButton
          label="Retire bulls"
          eligible={bull?.eligible ?? 0}
          inUse={bull?.inUse ?? 0}
          tone="bull"
          disabled={saving || (bull?.eligible ?? 0) === 0}
          onClick={() => setConfirmSide("bull")}
        />
        <span className="text-white/10">|</span>
        <RetireButton
          label="Retire bears"
          eligible={bear?.eligible ?? 0}
          inUse={bear?.inUse ?? 0}
          tone="bear"
          disabled={saving || (bear?.eligible ?? 0) === 0}
          onClick={() => setConfirmSide("bear")}
        />
      </div>

      <Dialog open={confirmSide != null} onOpenChange={(v) => !v && setConfirmSide(null)}>
        <DialogContent className="bg-[#1a1a1e] border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-sm">
              <Archive className="w-4 h-4 text-muted-foreground" />
              Retire unused {confirmSide === "bull" ? "bull" : "bear"} signals?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Sets{" "}
              <span className="text-white font-bold">{preview?.eligible ?? 0}</span> active{" "}
              {confirmSide === "bull" ? "long" : "short"} signal(s) to{" "}
              <span className="font-mono text-muted-foreground/80">INACTIVE</span>. Signals
              with an open sim or live position are kept (
              <span className="text-white font-bold">{preview?.inUse ?? 0}</span>).
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={saving}
                onClick={() => setConfirmSide(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving || (preview?.eligible ?? 0) === 0}
                className="bg-white/10 hover:bg-white/15 text-white"
                onClick={() => confirmSide && void runRetire(confirmSide)}
              >
                {saving ? "Retiring…" : `Retire ${preview?.eligible ?? 0}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RetireButton({
  label,
  eligible,
  inUse,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  eligible: number;
  inUse: number;
  tone: "bull" | "bear";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-colors",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        tone === "bull"
          ? "text-positive/70 hover:text-positive"
          : "text-negative/70 hover:text-negative",
      )}
      title={
        inUse > 0
          ? `${eligible} can retire · ${inUse} in open sim/live`
          : `${eligible} unused active signals`
      }
    >
      {label}
      {eligible > 0 && (
        <span className="ml-1 tabular-nums opacity-80">({eligible})</span>
      )}
    </button>
  );
}
