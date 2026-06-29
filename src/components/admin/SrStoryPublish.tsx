"use client";

import { useCallback, useState } from "react";
import { Clapperboard, Download, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { ScheduleToBufferPanel, type CaptionsLike } from "@/components/admin/ScheduleToBufferPanel";
import { CaptionReview } from "@/components/admin/CaptionReview";

type AuthedFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface Msg {
  kind: "info" | "ok" | "error";
  text: string;
}

/**
 * "Make video + post" modal for one SR-audit success story. Triggers a cloud
 * render of the WinStory reel, polls until the MP4 is ready, generates
 * per-platform captions, and hands both to the Schedule-to-Buffer panel.
 */
export function SrStoryPublish({
  authedFetch,
  story,
  onClose,
}: {
  authedFetch: AuthedFetch;
  story: { id: string; symbol: string; label: string };
  onClose: () => void;
}) {
  const [rendering, setRendering] = useState(false);
  const [renderMsg, setRenderMsg] = useState<Msg | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [captionError, setCaptionError] = useState("");
  const [captions, setCaptions] = useState<CaptionsLike | null>(null);

  const [generatingAll, setGeneratingAll] = useState(false);

  const pollRender = useCallback(
    async (renderId: string): Promise<boolean> => {
      const deadline = Date.now() + 12 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const res = await authedFetch(`/api/admin/videos/render-status?renderId=${encodeURIComponent(renderId)}`);
          const json = await res.json();
          if (!res.ok) continue;
          if (json.status === "ready" && json.url) {
            setVideoUrl(json.url as string);
            return true;
          }
          if (json.status === "failed") {
            setRenderMsg({ kind: "error", text: json.error ?? "Cloud render failed." });
            return false;
          }
          setRenderMsg({
            kind: "info",
            text: json.status === "rendering" ? "Rendering the reel… (a few minutes)" : "Render queued…",
          });
        } catch {
          /* transient — keep polling */
        }
      }
      setRenderMsg({ kind: "error", text: "Render timed out. Check back shortly." });
      return false;
    },
    [authedFetch],
  );

  const generateVideo = useCallback(async () => {
    setRendering(true);
    setRenderMsg({ kind: "info", text: "Starting cloud render…" });
    try {
      const res = await authedFetch("/api/admin/sr-audit/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Render failed");
      if (json.async && json.renderId) {
        const ok = await pollRender(json.renderId);
        if (ok) setRenderMsg({ kind: "ok", text: "Reel ready — preview below." });
      } else {
        setRenderMsg({ kind: "error", text: json.message ?? "Cloud renderer not available." });
      }
    } catch (e) {
      setRenderMsg({ kind: "error", text: e instanceof Error ? e.message : "Render failed" });
    } finally {
      setRendering(false);
    }
  }, [authedFetch, story.id, pollRender]);

  const generateCaptions = useCallback(async () => {
    setCaptionsLoading(true);
    setCaptionError("");
    try {
      const res = await authedFetch("/api/admin/sr-audit/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Caption generation failed (HTTP ${res.status})`);
      setCaptions(json.captions as CaptionsLike);
    } catch (e) {
      setCaptionError(e instanceof Error ? e.message : "Caption generation failed");
    } finally {
      setCaptionsLoading(false);
    }
  }, [authedFetch, story.id]);

  /** One click: render the reel + write captions together (same as /admin/videos "Generate all"). */
  const generateAll = useCallback(async () => {
    setGeneratingAll(true);
    try {
      // Captions only need the event data (quick); the render polls for minutes —
      // run both concurrently so captions are ready well before the MP4.
      await Promise.all([generateVideo(), generateCaptions()]);
    } finally {
      setGeneratingAll(false);
    }
  }, [generateVideo, generateCaptions]);

  const busy = generatingAll || rendering || captionsLoading;

  const msgColor = (k: Msg["kind"]) =>
    k === "ok" ? "text-emerald-300" : k === "error" ? "text-rose-300" : "text-slate-300";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-4"
      style={{ background: "rgba(2,6,23,0.88)" }}
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-5xl rounded-2xl border bg-[#0b1220]"
        style={{ borderColor: "rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
            Publish story · {story.symbol}
          </p>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {/* One-click: render + captions together (mirrors /admin/videos "Generate all"). */}
          <button
            type="button"
            onClick={() => void generateAll()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {generatingAll ? "Generating video + captions…" : "Generate video + captions"}
          </button>
          <p className="mt-2 mb-4 text-[10px] text-muted-foreground/60">
            Renders the reel and writes per-channel captions in one go — review captions on the right, then pick channels and schedule.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left column — reel + schedule */}
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-emerald-300" /> 1. Reel
                  </h3>
                  <button
                    type="button"
                    onClick={() => void generateVideo()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
                    {videoUrl ? "Re-render" : "Render only"}
                  </button>
                </div>
                {renderMsg && <p className={`mt-2 text-[11px] ${msgColor(renderMsg.kind)}`}>{renderMsg.text}</p>}
                {videoUrl && (
                  <div className="mt-3">
                    <video src={videoUrl} controls className="w-full rounded-lg border border-white/10" />
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                    >
                      <Download className="h-3 w-3" /> Open / download MP4
                    </a>
                  </div>
                )}
              </section>

              <ScheduleToBufferPanel
                authedFetch={authedFetch}
                source="sr-audit"
                contentId={story.id}
                contentLabel={story.label}
                captions={captions}
                videoUrl={videoUrl}
              />
            </div>

            {/* Right column — caption review (editable) */}
            <div className="lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-300" /> 2. Review captions
                </h3>
                <button
                  type="button"
                  onClick={() => void generateCaptions()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-400/30 text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"
                >
                  {captionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {captions ? "Regenerate" : "Captions only"}
                </button>
              </div>
              {captionError && <p className="mb-2 text-[11px] text-rose-300">{captionError}</p>}
              <CaptionReview captions={captions} onChange={setCaptions} disabled={busy} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
