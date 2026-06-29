"use client";

import { useMemo } from "react";
import { Scissors } from "lucide-react";
import { clampCaption, normalizeCaption } from "@/lib/social/platforms";
import type { CaptionsLike } from "@/components/admin/ScheduleToBufferPanel";

/**
 * Editable per-channel caption review. Shows each platform's caption in a
 * textarea with a live effective-length counter (after normalize + clamp to the
 * platform budget) so the admin can read and tweak every post before scheduling.
 * Edits flow back up via onChange; the same captions object feeds
 * ScheduleToBufferPanel, so what you review is exactly what gets posted.
 */

type FieldKey = "twitter" | "facebook" | "linkedin" | "instagram" | "youtubeTitle" | "youtubeDescription";

interface Field {
  key: FieldKey;
  label: string;
  budget: number;
  rows: number;
}

// Budgets mirror SOCIAL_PLATFORMS.postBudget; YouTube title is hard-capped at 95
// server-side, the rest are the description/body budgets.
const FIELDS: Field[] = [
  { key: "twitter", label: "X / Twitter", budget: 230, rows: 5 },
  { key: "facebook", label: "Facebook", budget: 400, rows: 6 },
  { key: "linkedin", label: "LinkedIn", budget: 1100, rows: 7 },
  { key: "instagram", label: "Instagram", budget: 1500, rows: 7 },
  { key: "youtubeTitle", label: "YouTube · Title", budget: 95, rows: 2 },
  { key: "youtubeDescription", label: "YouTube · Description", budget: 900, rows: 6 },
];

export function CaptionReview({
  captions,
  onChange,
  disabled,
  hideYouTube,
}: {
  captions: CaptionsLike | null;
  onChange: (next: CaptionsLike) => void;
  disabled?: boolean;
  /** Hide the YouTube title/description fields (e.g. image-only "news" posts). */
  hideYouTube?: boolean;
}) {
  const values = useMemo<CaptionsLike>(() => captions ?? {}, [captions]);
  const fields = hideYouTube ? FIELDS.filter((f) => !f.key.startsWith("youtube")) : FIELDS;

  if (!captions) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center text-[11px] text-muted-foreground/60">
        Generate captions to review and edit each channel&apos;s post here before scheduling.
      </div>
    );
  }

  const setField = (key: FieldKey, val: string) => onChange({ ...values, [key]: val });

  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const raw = (values[f.key] ?? "") as string;
        const effective = clampCaption(normalizeCaption(raw), f.budget);
        const trimmed = effective.length < normalizeCaption(raw).length;
        const over = effective.length > f.budget;
        return (
          <div key={f.key}>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{f.label}</label>
              <span
                className={`inline-flex items-center gap-1 font-mono text-[10px] ${over ? "text-rose-300" : "text-muted-foreground"}`}
                title={trimmed ? `Auto-trimmed to ${f.budget} chars before posting` : ""}
              >
                {trimmed && <Scissors className="h-2.5 w-2.5 text-violet-300" />}
                {effective.length}/{f.budget}
              </span>
            </div>
            <textarea
              value={raw}
              rows={f.rows}
              disabled={disabled}
              onChange={(e) => setField(f.key, e.target.value)}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-foreground/90 outline-none focus:border-violet-500/40 disabled:opacity-60"
            />
          </div>
        );
      })}
    </div>
  );
}
