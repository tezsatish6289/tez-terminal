"use client";

import { useCallback, useMemo, useState } from "react";
import { TopBar } from "@/components/dashboard/TopBar";
import { CaptionReview } from "@/components/admin/CaptionReview";
import { ScheduleToBufferPanel, type CaptionsLike } from "@/components/admin/ScheduleToBufferPanel";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Newspaper,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";

interface NewsSource {
  title: string;
  url: string;
}
interface NewsDraft {
  headline: string;
  summary: string;
  sources: NewsSource[];
  captions: CaptionsLike;
  imagePrompt: string;
}
interface Msg {
  kind: "info" | "ok" | "error";
  text: string;
}

const PLACEHOLDER = `Paste the news here — article text or summary, a link, and any directions for how you want it covered.

e.g.
RBI kept the repo rate unchanged at 6.5% in today's policy. https://example.com/rbi-policy
Focus on what it means for F&O traders. Keep it neutral and educational.`;

export default function NewsAdminPage() {
  const { user, isUserLoading: authLoading } = useUser();
  const isAdmin = isAdminEmail(user?.email);

  const [prompt, setPrompt] = useState("");
  const [contentId, setContentId] = useState<string | null>(null);

  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState<Msg | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [captions, setCaptions] = useState<CaptionsLike | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");

  const [imaging, setImaging] = useState(false);
  const [imageMsg, setImageMsg] = useState<Msg | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const authedFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const idToken = await user!.getIdToken();
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${idToken}`);
      return fetch(input, { ...init, headers });
    },
    [user],
  );

  const runDraft = useCallback(async () => {
    if (!prompt.trim()) {
      setDraftMsg({ kind: "error", text: "Paste the news / link / directions first." });
      return;
    }
    setDrafting(true);
    setDraftMsg({ kind: "info", text: "Researching the news and drafting captions…" });
    try {
      const res = await authedFetch("/api/admin/news/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      const d = json.draft as NewsDraft;
      setDraft(d);
      setCaptions(d.captions);
      setImagePrompt(d.imagePrompt);
      setContentId(`news-${Date.now()}`);
      setImageUrl(null);
      setImageMsg(null);
      setDraftMsg({ kind: "ok", text: "Draft ready — review captions, then generate the image." });
    } catch (e) {
      setDraftMsg({ kind: "error", text: e instanceof Error ? e.message : "Draft failed" });
    } finally {
      setDrafting(false);
    }
  }, [prompt, authedFetch]);

  const runImage = useCallback(async () => {
    if (!draft || !contentId) return;
    setImaging(true);
    setImageMsg({ kind: "info", text: "Generating a branded image…" });
    try {
      const res = await authedFetch("/api/admin/news/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          headline: draft.headline,
          imagePrompt: imagePrompt.trim() || draft.imagePrompt,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Image generation failed");
      setImageUrl(json.imageUrl as string);
      setImageMsg({ kind: "ok", text: "Image ready." });
    } catch (e) {
      setImageMsg({ kind: "error", text: e instanceof Error ? e.message : "Image generation failed" });
    } finally {
      setImaging(false);
    }
  }, [draft, contentId, imagePrompt, authedFetch]);

  const msgColor = (k: Msg["kind"]) =>
    k === "ok" ? "text-emerald-300" : k === "error" ? "text-rose-300" : "text-slate-300";

  const label = useMemo(() => draft?.headline ?? "News post", [draft]);

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
      <main className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-violet-400" />
            News → Social
          </h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5 max-w-2xl">
            Paste a piece of news (text + link + your directions). Gemini researches it, drafts a post for each
            channel, and creates a branded image. Review everything, then schedule to Buffer. Posts go to X,
            Facebook, LinkedIn and Instagram (YouTube is video-only). Informational, not investment advice.
          </p>
        </div>

        {/* 1. Prompt */}
        <section className="rounded-xl border border-white/10 p-3 mb-4">
          <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" /> 1. The news + your directions
          </h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-foreground/90 outline-none focus:border-violet-500/40"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void runDraft()}
              disabled={drafting || !prompt.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
            >
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {drafting ? "Researching + drafting…" : "Research & draft"}
            </button>
            {draftMsg && <span className={`text-[11px] ${msgColor(draftMsg.kind)}`}>{draftMsg.text}</span>}
          </div>
        </section>

        {draft && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left — research, image, schedule */}
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 p-3">
                <h3 className="text-sm font-bold text-white mb-1">Research brief</h3>
                <p className="text-[12px] leading-relaxed text-slate-300 whitespace-pre-wrap">{draft.summary}</p>
                {draft.sources.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Sources</p>
                    <ul className="space-y-1">
                      {draft.sources.slice(0, 8).map((s) => (
                        <li key={s.url}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[420px]">{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-emerald-300" /> 2. Image
                  </h3>
                  <button
                    type="button"
                    onClick={() => void runImage()}
                    disabled={imaging}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    {imaging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    {imageUrl ? "Regenerate" : "Generate image"}
                  </button>
                </div>
                {imageMsg && <p className={`mt-2 text-[11px] ${msgColor(imageMsg.kind)}`}>{imageMsg.text}</p>}
                <label className="mt-3 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Art direction (editable)
                  </span>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-slate-300 outline-none focus:border-emerald-500/40"
                  />
                </label>
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="News card"
                    className="mt-3 w-full max-w-[360px] rounded-lg border border-white/10"
                  />
                )}
              </section>

              <ScheduleToBufferPanel
                authedFetch={authedFetch}
                source="news"
                contentId={contentId ?? "news"}
                contentLabel={label}
                captions={captions}
                imageUrl={imageUrl}
              />
            </div>

            {/* Right — caption review (editable) */}
            <div className="lg:max-h-[78vh] lg:overflow-y-auto lg:pr-1">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-300" /> 3. Review captions
              </h3>
              <CaptionReview captions={captions} onChange={setCaptions} disabled={drafting} hideYouTube />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
