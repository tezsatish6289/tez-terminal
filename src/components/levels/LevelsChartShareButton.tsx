"use client";

import { useCallback, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { LevelsShareContext } from "@/lib/levels/levels-share";
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LevelsChartShareButton({
  context,
  captureImage,
  iconOnly = false,
  disabled = false,
  className = "",
}: {
  context: LevelsShareContext;
  captureImage?: () => Promise<Blob | null>;
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      if (captureImage) {
        blob = await captureImage();
      }

      const file =
        blob != null
          ? new File([blob], context.fileName, { type: "image/png" })
          : null;

      if (typeof navigator.share === "function") {
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: context.title,
              text: context.text,
              url: context.shareUrl,
              files: [file],
            });
            return;
          }
          await navigator.share({
            title: context.title,
            text: context.text,
            url: context.shareUrl,
          });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }

      const copied = await copyText(context.text);
      if (copied) {
        toast({
          title: "Link copied",
          description: "Share text copied — paste into WhatsApp, X, or Telegram.",
        });
        return;
      }

      toast({
        title: "Could not share",
        description: "Copy the link from your browser address bar.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, captureImage, context]);

  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={() => void handleShare()}
      className={
        iconOnly
          ? `inline-flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-[1.06] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${className}`.trim()
          : `inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${className}`.trim()
      }
      style={{
        color: "#bfdbfe",
        backgroundColor: "rgba(59,130,246,0.1)",
        border: "1px solid rgba(96,165,250,0.35)",
      }}
      title="Share chart with FNONINJA link"
      aria-label={`Share ${context.title}`}
    >
      {busy ? (
        <Loader2 className={iconOnly ? "h-4 w-4 animate-spin shrink-0" : "h-3.5 w-3.5 animate-spin shrink-0"} />
      ) : (
        <Share2 className={iconOnly ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} strokeWidth={2} />
      )}
      {!iconOnly ? <span className="whitespace-nowrap">Share</span> : null}
    </button>
  );
}
