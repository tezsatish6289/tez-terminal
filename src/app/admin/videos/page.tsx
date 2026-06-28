"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  ShieldAlert,
  RefreshCw,
  Copy,
  Check,
  Download,
  Upload,
  Film,
  Sparkles,
  Twitter,
  Facebook,
  Linkedin,
  Youtube,
  Instagram,
  AlertTriangle,
  Terminal,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ScheduleToBufferPanel } from "@/components/admin/ScheduleToBufferPanel";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

type PlatformId = "twitter" | "facebook" | "linkedin" | "youtube" | "instagram";

interface ApiPlatform {
  id: PlatformId;
  label: string;
  icon: string;
  charLimit: number;
  hashtags: boolean;
  guidance: string;
}

interface ApiTopic {
  id: string;
  label: string;
  description: string;
  variant: "put" | "call";
  compositionId: string;
  propsFile: string;
  outputFile: string;
  data: { exists: boolean; modifiedAt: string | null; size: number | null };
  video: { exists: boolean; modifiedAt: string | null; size: number | null };
  renderCommand: string;
}

interface VideosApiResponse {
  topics: ApiTopic[];
  platforms: ApiPlatform[];
  renderable: boolean;
  baseUrl: string;
  aiConfigured: boolean;
}

type Captions = Record<PlatformId, string> & {
  youtubeTitle?: string;
  youtubeDescription?: string;
};

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  Twitter,
  Facebook,
  Linkedin,
  Youtube,
  Instagram,
};

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function VideosAdminPage() {
  const { user, isUserLoading: authLoading } = useUser();
  const isAdmin = user?.email && ADMIN_EMAILS.has(user.email);

  const [resp, setResp] = useState<VideosApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Per-action state for the selected topic.
  const [captions, setCaptions] = useState<Captions | null>(null);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [captionError, setCaptionError] = useState("");
  const [captionDate, setCaptionDate] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [renderMsg, setRenderMsg] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(null);
  // One-click "do everything" orchestration.
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: "render" | "captions" | "done" | "error"; text: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<string>("");
  const [videoLoading, setVideoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authedFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      if (!user) throw new Error("Not signed in");
      const idToken = await user.getIdToken();
      return fetch(input, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${idToken}` },
      });
    },
    [user],
  );

  const loadList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch("/api/admin/videos");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setResp(json as VideosApiResponse);
      setSelectedId((prev) => prev ?? (json.topics[0]?.id ?? null));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => {
    if (isAdmin) void loadList();
  }, [isAdmin, loadList]);

  const selected = useMemo(
    () => resp?.topics.find((t) => t.id === selectedId) ?? null,
    [resp, selectedId],
  );

  // Reset per-topic UI when switching topics.
  useEffect(() => {
    setCaptions(null);
    setCaptionError("");
    setCaptionDate("");
    setRenderMsg(null);
    setVideoSource("");
    setVideoUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, [selectedId]);

  const setVideoBlob = useCallback((blob: Blob, source: string) => {
    setVideoUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
    setVideoSource(source);
  }, []);

  const loadRenderedVideo = useCallback(async () => {
    if (!selected) return;
    setVideoLoading(true);
    setRenderMsg(null);
    try {
      const res = await authedFetch(`/api/admin/videos/file?topicId=${selected.id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Video not available");
      }
      const blob = await res.blob();
      setVideoBlob(blob, `Rendered ${selected.outputFile}`);
    } catch (err: unknown) {
      setRenderMsg({ kind: "error", text: err instanceof Error ? err.message : "Failed to load video" });
    } finally {
      setVideoLoading(false);
    }
  }, [selected, authedFetch, setVideoBlob]);

  const generateCaptions = useCallback(async () => {
    if (!selected) return;
    setCaptionsLoading(true);
    setCaptionError("");
    setError("");
    try {
      const res = await authedFetch("/api/admin/videos/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selected.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Caption generation failed (HTTP ${res.status})`);
      setCaptions(json.captions as Captions);
      setCaptionDate(json.summary?.dateLabel ?? "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Caption generation failed";
      setCaptionError(msg);
    } finally {
      setCaptionsLoading(false);
    }
  }, [selected, authedFetch]);

  const generateVideo = useCallback(async () => {
    if (!selected) return;
    setRendering(true);
    setRenderMsg({ kind: "info", text: "Rendering… this takes a few minutes. Keep this tab open." });
    try {
      const res = await authedFetch("/api/admin/videos/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selected.id, refreshData: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Render failed");
      if (json.rendered) {
        setRenderMsg({ kind: "ok", text: "Render complete. Loading preview…" });
        await loadList();
        await loadRenderedVideo();
      } else if (json.reason === "NOT_LOCAL") {
        setRenderMsg({ kind: "info", text: json.message });
      } else {
        setRenderMsg({ kind: "error", text: json.message ?? `Render failed (exit ${json.code}). See the log / run the command manually.` });
      }
    } catch (err: unknown) {
      setRenderMsg({ kind: "error", text: err instanceof Error ? err.message : "Render failed" });
    } finally {
      setRendering(false);
    }
  }, [selected, authedFetch, loadList, loadRenderedVideo]);

  /** One click: fetch fresh data → render video → write captions → show both. */
  const generateAll = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setCaptionError("");
    setRenderMsg(null);
    setProgress({ stage: "render", text: "Step 1/2 · Fetching today's data and rendering the video… (a few minutes — keep this tab open)" });

    let videoReady = false;
    let dataMissing = false;
    try {
      const res = await authedFetch("/api/admin/videos/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selected.id, refreshData: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Render failed");
      if (json.rendered) {
        videoReady = true;
      } else if (json.reason === "NO_DATA" || json.reason === "FETCH_FAILED") {
        dataMissing = true;
        setRenderMsg({ kind: "error", text: json.message ?? "No data available to build the video." });
      } else if (json.reason === "NOT_LOCAL") {
        setRenderMsg({ kind: "info", text: json.message });
      } else {
        setRenderMsg({ kind: "error", text: json.message ?? `Render failed (exit ${json.code}).` });
      }
    } catch (err: unknown) {
      setRenderMsg({ kind: "error", text: err instanceof Error ? err.message : "Render failed" });
    }

    // If there's no data at all, captions would fail the same way — stop early.
    if (dataMissing) {
      setProgress({
        stage: "error",
        text: "No qualifying stocks were available right now, so nothing could be generated. See the message in the Video panel.",
      });
      setBusy(false);
      return;
    }

    // Captions (needs the data file the render step just refreshed).
    setProgress({ stage: "captions", text: "Step 2/2 · Writing per-platform captions…" });
    let captionsReady = false;
    try {
      const res = await authedFetch("/api/admin/videos/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selected.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Caption generation failed (HTTP ${res.status})`);
      setCaptions(json.captions as Captions);
      setCaptionDate(json.summary?.dateLabel ?? "");
      captionsReady = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Caption generation failed";
      setCaptionError(msg);
    }

    if (videoReady) {
      await loadList();
      await loadRenderedVideo();
    }

    setProgress({
      stage: videoReady && captionsReady ? "done" : "error",
      text:
        videoReady && captionsReady
          ? "Done — video preview and captions are ready below. Download the video and copy each caption."
          : videoReady
          ? "Video is ready, but captions failed — try Generate captions again."
          : captionsReady
          ? "Captions are ready. The video wasn't rendered here — run the command below (or open this page locally)."
          : "Couldn't complete. See the messages below.",
    });
    setBusy(false);
  }, [selected, authedFetch, loadList, loadRenderedVideo]);

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setVideoBlob(file, `Local file · ${file.name}`);
    setRenderMsg(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="text-sm font-medium">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-blue-400" />
              Videos
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5 max-w-2xl">
              Generate the daily FNONINJA cluster videos and per-platform captions. The same video
              is posted everywhere — only the text changes per platform.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white transition-colors border border-white/10 hover:border-white/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {resp && resp.aiConfigured === false && (
          <div className="rounded-xl p-3 mb-4 border border-rose-500/20 bg-rose-500/5 text-[11px] text-rose-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Gemini API key not loaded. Add <code className="text-rose-100/80">GOOGLE_GENAI_API_KEY</code> to{" "}
              <code className="text-rose-100/80">.env.local</code> and restart{" "}
              <code className="text-rose-100/80">npm run dev</code> — captions need it; video rendering does not.
            </span>
          </div>
        )}

        {!resp?.renderable && resp && (
          <div className="rounded-xl p-3 mb-4 border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-200/90 flex items-start gap-2">
            <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This server can&apos;t render video. Open this page on your local dev machine
              (<code className="text-amber-100/80">http://localhost:9002/admin/videos</code>) to use
              the Generate button, or run the command shown under a topic. Captions work anywhere.
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {/* Topic picker */}
        <div className="flex flex-wrap gap-2 mb-5">
          {resp?.topics.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`px-3.5 py-2 rounded-xl text-left border transition-all ${
                selectedId === t.id
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <Film className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-sm font-bold text-white">{t.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[260px]">{t.description}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${t.video.exists ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>
                  {t.video.exists ? "Video ready" : "No video"}
                </span>
                {t.data.exists && (
                  <span className="text-[9px] text-muted-foreground">
                    data {t.data.modifiedAt ? format(new Date(t.data.modifiedAt), "MMM d HH:mm") : ""}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* One-click hero action */}
        {selected && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.07] p-4 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">{selected.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  One click: fetch today&apos;s data → render the video → write captions for every platform.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void generateAll()}
                disabled={busy}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Working…" : "Generate video + captions"}
              </button>
            </div>
            {progress && (
              <div
                className={`mt-3 rounded-lg p-2.5 text-[11px] flex items-start gap-2 border ${
                  progress.stage === "error"
                    ? "border-rose-500/20 bg-rose-500/5 text-rose-300"
                    : progress.stage === "done"
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                    : "border-blue-500/20 bg-blue-500/10 text-blue-100"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />
                ) : progress.stage === "done" ? (
                  <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : progress.stage === "error" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : null}
                <span>{progress.text}</span>
              </div>
            )}
          </div>
        )}

        {selected && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── Video column ── */}
            <section className="rounded-xl border border-white/10 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Film className="h-4 w-4 text-blue-400" />
                  Video
                </h2>
                <span className="text-[10px] text-muted-foreground font-mono">{selected.compositionId}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => void generateVideo()}
                  disabled={rendering || busy || !resp?.renderable}
                  title={resp?.renderable ? "" : "Only available on your local dev machine"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 disabled:opacity-40"
                >
                  {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                  {rendering ? "Rendering…" : "Re-render video only"}
                </button>
                {selected.video.exists && (
                  <button
                    type="button"
                    onClick={() => void loadRenderedVideo()}
                    disabled={videoLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                  >
                    {videoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                    Load latest ({formatBytes(selected.video.size)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Load MP4
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {renderMsg && (
                <div
                  className={`rounded-lg p-2.5 mb-3 text-[11px] flex items-start gap-2 border ${
                    renderMsg.kind === "error"
                      ? "border-rose-500/20 bg-rose-500/5 text-rose-300"
                      : renderMsg.kind === "ok"
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                      : "border-blue-500/20 bg-blue-500/5 text-blue-200"
                  }`}
                >
                  {renderMsg.kind === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  ) : renderMsg.kind === "info" && rendering ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />
                  ) : null}
                  <span>{renderMsg.text}</span>
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onPickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className="rounded-lg border border-dashed border-white/15 bg-black/30 aspect-[9/16] max-h-[460px] mx-auto flex items-center justify-center overflow-hidden"
                style={{ width: "min(100%, 259px)" }}
              >
                {videoUrl ? (
                  <video src={videoUrl} controls playsInline className="h-full w-full object-contain bg-black" />
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 text-center px-4">
                    No preview loaded. Generate, load the latest render, or drop an MP4 here.
                  </p>
                )}
              </div>

              {videoUrl && (
                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className="text-[10px] text-muted-foreground truncate">{videoSource}</span>
                  <a
                    href={videoUrl}
                    download={`${selected.id}.mp4`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Render command
                  </span>
                  <CopyButton text={selected.renderCommand} />
                </div>
                <code className="block text-[10px] text-blue-200/80 break-all leading-relaxed">
                  {selected.renderCommand}
                </code>
              </div>
            </section>

            {/* ── Captions column ── */}
            <section className="rounded-xl border border-white/10 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Captions
                  {captionDate && <span className="text-[10px] font-normal text-muted-foreground">· {captionDate}</span>}
                </h2>
                <button
                  type="button"
                  onClick={() => void generateCaptions()}
                  disabled={captionsLoading || busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 disabled:opacity-40"
                >
                  {captionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {captions ? "Regenerate captions" : "Captions only"}
                </button>
              </div>

              {captionError && (
                <div className="rounded-lg p-2.5 mb-3 text-[11px] flex items-start gap-2 border border-rose-500/20 bg-rose-500/5 text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{captionError}</span>
                </div>
              )}

              {!captions && !captionsLoading && !captionError && (
                <p className="text-[11px] text-muted-foreground/60 py-8 text-center">
                  Generate AI captions from the exact data in this video — one tailored post per platform.
                </p>
              )}
              {captionsLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              )}

              {captions && (
                <div className="space-y-3">
                  {resp?.platforms
                    .filter((p) => p.id !== "youtube")
                    .map((p) => {
                    const Icon = PLATFORM_ICONS[p.icon] ?? Sparkles;
                    const text = captions[p.id] ?? "";
                    const over = text.length > p.charLimit;
                    return (
                      <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-blue-400" />
                            {p.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono ${over ? "text-rose-400" : "text-muted-foreground"}`}>
                              {text.length}/{p.charLimit}
                            </span>
                            <CopyButton text={text} />
                          </div>
                        </div>
                        <textarea
                          value={text}
                          onChange={(e) =>
                            setCaptions((prev) => (prev ? { ...prev, [p.id]: e.target.value } : prev))
                          }
                          rows={p.id === "instagram" || p.id === "linkedin" ? 8 : 5}
                          className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-foreground/90 leading-relaxed outline-none focus:border-blue-500/40 font-mono whitespace-pre-wrap"
                        />
                      </div>
                    );
                  })}

                  {/* YouTube — separate title + description */}
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Youtube className="h-3.5 w-3.5 text-blue-400" />
                        YouTube (Shorts)
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Title</span>
                          <CopyButton text={captions.youtubeTitle ?? ""} label="Copy title" />
                        </div>
                        <textarea
                          value={captions.youtubeTitle ?? ""}
                          onChange={(e) =>
                            setCaptions((prev) => (prev ? { ...prev, youtubeTitle: e.target.value } : prev))
                          }
                          rows={2}
                          className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-foreground/90 leading-relaxed outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Description</span>
                          <CopyButton text={captions.youtubeDescription ?? ""} label="Copy description" />
                        </div>
                        <textarea
                          value={captions.youtubeDescription ?? ""}
                          onChange={(e) =>
                            setCaptions((prev) =>
                              prev ? { ...prev, youtubeDescription: e.target.value } : prev,
                            )
                          }
                          rows={8}
                          className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-foreground/90 leading-relaxed outline-none focus:border-blue-500/40 font-mono whitespace-pre-wrap"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {selected && (
          <div className="mt-5">
            <ScheduleToBufferPanel
              authedFetch={authedFetch}
              source="videos"
              contentId={selected.id}
              contentLabel={selected.label}
              captions={captions}
              videoUrl={videoUrl}
            />
          </div>
        )}
      </main>
    </div>
  );
}
