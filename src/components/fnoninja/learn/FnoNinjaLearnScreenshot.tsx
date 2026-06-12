"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

/**
 * Article screenshot slot. Drop PNGs under public/fnoninja/learn/ — same path as `src`.
 * Shows a styled placeholder until the asset exists.
 */
export function FnoNinjaLearnScreenshot({
  src,
  alt,
  caption,
  step,
}: {
  src: string;
  alt: string;
  caption: string;
  step?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = failed || !src;

  return (
    <figure className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden aspect-[16/10] w-full"
        style={{
          border: "1px solid rgba(90,140,220,0.18)",
          backgroundColor: "rgba(8,15,30,0.6)",
        }}
      >
        {showPlaceholder ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            {step != null ? (
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#60a5fa" }}
              >
                Step {step}
              </span>
            ) : null}
            <ImageIcon className="h-8 w-8" style={{ color: "#475569" }} />
            <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#64748b" }}>
              Screenshot placeholder — add{" "}
              <code className="text-[11px] text-slate-400">{src}</code>
            </p>
          </div>
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover object-top"
            sizes="(max-width: 768px) 100vw, 720px"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
        {caption}
      </figcaption>
    </figure>
  );
}
