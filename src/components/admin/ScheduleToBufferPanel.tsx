"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Scissors,
  Send,
  Share2,
} from "lucide-react";
import { clampCaption, normalizeCaption } from "@/lib/social/platforms";

type PlatformId = "twitter" | "facebook" | "linkedin" | "instagram" | "youtube";

interface ChannelInfo {
  id: PlatformId;
  label: string;
  connected: boolean;
  postBudget: number;
  hardLimit: number;
}

export interface CaptionsLike {
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  instagram?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
}

interface ChannelResult {
  platform: PlatformId;
  status: "posted" | "scheduled" | "skipped" | "failed";
  postId?: string;
  dueAt?: string;
  charCount?: number;
  error?: string;
}

type AuthedFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Local Date → <input type="datetime-local"> value (YYYY-MM-DDTHH:mm). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLE: Record<ChannelResult["status"], string> = {
  posted: "text-emerald-300 bg-emerald-500/15",
  scheduled: "text-blue-300 bg-blue-500/15",
  skipped: "text-amber-300 bg-amber-500/15",
  failed: "text-rose-300 bg-rose-500/15",
};

/**
 * Self-contained "Schedule to Buffer" panel. Drop it under any content surface
 * that has per-platform captions + a video (blob/object URL): it loads the
 * connected Buffer channels, lets the admin pick platforms + timing, and posts
 * one (clamped) caption per channel through /api/admin/social/schedule.
 */
export function ScheduleToBufferPanel({
  authedFetch,
  source,
  contentId,
  contentLabel,
  captions,
  videoUrl,
  imageUrl = null,
}: {
  authedFetch: AuthedFetch;
  source: string;
  contentId: string;
  contentLabel: string;
  captions: CaptionsLike | null;
  /** Blob/object/public URL for an MP4 video post. */
  videoUrl?: string | null;
  /** Blob/object/public URL for an image post (YouTube is excluded for images). */
  imageUrl?: string | null;
}) {
  // Image posts use the image asset; otherwise video. Buffer publishes YouTube
  // as Shorts (video only), so an image post can't include YouTube.
  const isImage = !!imageUrl && !videoUrl;
  const mediaUrl = isImage ? imageUrl : videoUrl ?? null;
  const [platforms, setPlatforms] = useState<ChannelInfo[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [selected, setSelected] = useState<Set<PlatformId>>(new Set());
  const [mode, setMode] = useState<"now" | "scheduled">("scheduled");
  const [whenLocal, setWhenLocal] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60_000)));
  const [jitter, setJitter] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ChannelResult[] | null>(null);

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    setChannelError("");
    try {
      const res = await authedFetch("/api/admin/social/channels");
      const json = await res.json();
      if (!res.ok && json.configured !== false) throw new Error(json.error ?? "Failed to load channels");
      setConfigured(json.configured !== false);
      const list: ChannelInfo[] = json.platforms ?? [];
      setPlatforms(list);
      setSelected(new Set(list.filter((p) => p.connected).map((p) => p.id)));
      if (json.configured === false) setChannelError(json.error ?? "Buffer API key not configured.");
    } catch (e) {
      setChannelError(e instanceof Error ? e.message : "Failed to load channels");
    } finally {
      setLoadingChannels(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const captionFor = useCallback(
    (id: PlatformId): string => {
      if (!captions) return "";
      if (id === "youtube") {
        return [captions.youtubeTitle, captions.youtubeDescription].filter(Boolean).join("\n\n").trim();
      }
      return (captions[id] ?? "").trim();
    },
    [captions],
  );

  const toggle = (id: PlatformId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = useMemo(
    () =>
      platforms.filter(
        (p) =>
          p.connected &&
          selected.has(p.id) &&
          captionFor(p.id) &&
          !(isImage && p.id === "youtube"),
      ),
    [platforms, selected, captionFor, isImage],
  );

  const submit = useCallback(async () => {
    if (!mediaUrl) {
      setError(isImage ? "Generate the image first — Buffer needs it." : "Load or generate the video first — Buffer needs the MP4.");
      return;
    }
    if (chosen.length === 0) {
      setError("Pick at least one connected platform that has a caption.");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    try {
      // An already-hosted public URL is handed straight to the API (no
      // re-download/upload); a local blob: preview needs its bytes uploaded.
      const isPublicUrl = /^https?:\/\//i.test(mediaUrl);
      const blob = isPublicUrl ? null : await (await fetch(mediaUrl)).blob();
      const timing =
        mode === "now"
          ? { mode: "now" as const }
          : { mode: "scheduled" as const, baseIso: new Date(whenLocal).toISOString(), jitterMinutes: jitter };

      const captionsPayload: Record<string, string> = {};
      for (const p of chosen) captionsPayload[p.id] = captionFor(p.id);

      const fd = new FormData();
      if (blob) fd.append(isImage ? "image" : "video", blob, `${contentId}.${isImage ? "png" : "mp4"}`);
      fd.append(
        "payload",
        JSON.stringify({
          source,
          contentId,
          contentLabel,
          captions: captionsPayload,
          platforms: chosen.map((p) => p.id),
          timing,
          ...(isPublicUrl ? (isImage ? { imageUrl: mediaUrl } : { videoUrl: mediaUrl }) : {}),
        }),
      );

      const res = await authedFetch("/api/admin/social/schedule", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Scheduling failed");
      setResults(json.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scheduling failed");
    } finally {
      setBusy(false);
    }
  }, [mediaUrl, isImage, chosen, mode, whenLocal, jitter, captionFor, source, contentId, contentLabel, authedFetch]);

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Share2 className="h-4 w-4 text-violet-300" />
          Schedule to Buffer
        </h2>
        {loadingChannels && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!configured && (
        <div className="rounded-lg p-2.5 mb-3 text-[11px] flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Buffer isn&apos;t connected. Add <code className="text-amber-100/80">BUFFER_API_KEY</code> (from
            publish.buffer.com/settings/api) to the environment, then refresh.
          </span>
        </div>
      )}
      {channelError && configured && (
        <div className="rounded-lg p-2.5 mb-3 text-[11px] flex items-start gap-2 border border-rose-500/20 bg-rose-500/5 text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{channelError}</span>
        </div>
      )}

      {/* Platform picker */}
      <div className="flex flex-wrap gap-2 mb-3">
        {platforms.map((p) => {
          const raw = captionFor(p.id);
          const normalized = normalizeCaption(raw);
          const effective = clampCaption(normalized, p.postBudget);
          const trimmed = effective.length < normalized.length;
          const ytImageBlock = isImage && p.id === "youtube";
          const disabled = !p.connected || !raw || ytImageBlock;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(p.id)}
              title={
                ytImageBlock
                  ? "YouTube only accepts video (Shorts) — not available for image posts"
                  : !p.connected
                  ? "Not connected in Buffer"
                  : !raw
                  ? "No caption for this platform"
                  : trimmed
                  ? `Caption auto-trimmed to ${p.postBudget} chars before posting`
                  : ""
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selected.has(p.id) && !disabled
                  ? "border-violet-500/60 bg-violet-500/15 text-white"
                  : "border-white/10 text-muted-foreground hover:border-white/20"
              } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {p.label}
              {p.connected && raw ? (
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  {trimmed && <Scissors className="h-2.5 w-2.5 text-violet-300" />}
                  {effective.length}/{p.postBudget}
                </span>
              ) : !p.connected ? (
                <span className="ml-1.5 text-[10px] text-rose-300/70">off</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Timing */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode("scheduled")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${mode === "scheduled" ? "border-violet-500/60 bg-violet-500/15 text-white" : "border-white/10 text-muted-foreground"}`}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setMode("now")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${mode === "now" ? "border-violet-500/60 bg-violet-500/15 text-white" : "border-white/10 text-muted-foreground"}`}
          >
            Post now
          </button>
        </div>

        {mode === "scheduled" && (
          <>
            <input
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-foreground/90 outline-none focus:border-violet-500/40"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              ± jitter
              <input
                type="number"
                min={0}
                max={120}
                value={jitter}
                onChange={(e) => setJitter(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                className="w-14 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-foreground/90 outline-none focus:border-violet-500/40"
              />
              min
            </label>
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 mb-3">
        One post per channel, each with its own caption (clamped to budget) and an independently randomized time within
        the jitter window — so the cadence never looks automated.
      </p>

      {error && (
        <div className="rounded-lg p-2.5 mb-3 text-[11px] flex items-start gap-2 border border-rose-500/20 bg-rose-500/5 text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !configured || chosen.length === 0 || !mediaUrl}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy
          ? "Sending to Buffer…"
          : mode === "now"
          ? `Post now to ${chosen.length} channel${chosen.length === 1 ? "" : "s"}`
          : `Schedule ${chosen.length} channel${chosen.length === 1 ? "" : "s"}`}
      </button>
      {!mediaUrl && (
        <p className="text-[10px] text-amber-300/70 mt-2">
          {isImage ? "Generate the image above first." : "Load or generate the video above first."}
        </p>
      )}

      {results && (
        <div className="mt-3 space-y-1.5">
          {results.map((r) => (
            <div key={r.platform} className="flex items-center gap-2 text-[11px]">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold uppercase ${STATUS_STYLE[r.status]}`}>
                {r.status === "posted" || r.status === "scheduled" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {r.status}
              </span>
              <span className="text-white/80 font-medium">{r.platform}</span>
              {r.dueAt && (
                <span className="text-muted-foreground/60">
                  @ {new Date(r.dueAt).toLocaleString()}
                </span>
              )}
              {r.error && <span className="text-rose-300/80">— {r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
