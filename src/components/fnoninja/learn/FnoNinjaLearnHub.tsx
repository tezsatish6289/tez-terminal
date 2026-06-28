"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Clock } from "lucide-react";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import type { LucideIcon } from "lucide-react";
import { LEARN_ARTICLES, type LearnArticleMeta } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";
import { FnoNinjaLearnDisclaimer } from "@/components/fnoninja/learn/FnoNinjaLearnDisclaimer";
import { LearnHistoryCardThumbnail } from "@/components/fnoninja/learn/LearnHistoryCardThumbnail";
import { LearnAtlasCardThumbnail } from "@/components/fnoninja/learn/LearnAtlasCardThumbnail";
import { LearnOutlookCardThumbnail } from "@/components/fnoninja/learn/LearnOutlookCardThumbnail";
import { LearnOiDeltaCardThumbnail } from "@/components/fnoninja/learn/LearnOiDeltaCardThumbnail";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER, FNO_MUTED } from "@/lib/fnoninja/theme";

function LearnCardImageThumbnail({
  accent,
  src,
  icon: Icon,
}: {
  accent: string;
  src?: string;
  icon: LucideIcon;
}) {
  const [imgFailed, setImgFailed] = useState(!src);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ background: accent }}>
      {src && !imgFailed ? (
        <Image
          src={src}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-12 w-12 opacity-40" style={{ color: "#f8fafc" }} />
        </div>
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(8,15,30,0.85) 0%, transparent 55%)" }}
      />
    </div>
  );
}

function LearnCardThumbnail({ article }: { article: LearnArticleMeta }) {
  const Icon = article.icon;
  if (article.thumbnailVariant === "outlook-live") {
    return <LearnOutlookCardThumbnail accent={article.thumbnailAccent} />;
  }
  if (article.thumbnailVariant === "oi-delta-live") {
    return <LearnOiDeltaCardThumbnail accent={article.thumbnailAccent} />;
  }
  if (article.thumbnailVariant === "atlas-live") {
    return <LearnAtlasCardThumbnail accent={article.thumbnailAccent} />;
  }
  if (article.thumbnailVariant === "history-live") {
    return <LearnHistoryCardThumbnail accent={article.thumbnailAccent} />;
  }
  return (
    <LearnCardImageThumbnail accent={article.thumbnailAccent} src={article.thumbnailSrc} icon={Icon} />
  );
}

export function FnoNinjaLearnHub() {
  const pathname = usePathname();

  return (
    <div className={`${FB_CONTENT_SHELL} py-12 sm:py-16 lg:py-20`}>
      <div className="max-w-3xl mb-10 sm:mb-12">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          Learn
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1] mb-4">
          Understand the data before you use it
        </h1>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
          Short, plain-language guides to option-chain zones — written so you do not need a trading
          background. We explain what you are looking at; you decide what it means for you.
        </p>
      </div>

      <FnoNinjaLearnDisclaimer className="mb-10 max-w-3xl" />

      <p className="text-sm font-semibold mb-4" style={{ color: "#64748b" }}>
        {LEARN_ARTICLES.length} guides
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 max-w-5xl">
        {LEARN_ARTICLES.map((article) => {
          const href = fnoLearnHref(pathname, article.slug);

          return (
            <Link
              key={article.slug}
              href={href}
              className="group flex flex-col rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5 h-full"
              style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
            >
              <LearnCardThumbnail article={article} />
              <div className="flex flex-col flex-1 p-5 sm:p-6">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color: FNO_ACCENT }}
                >
                  {article.tag}
                </span>
                <h2 className="text-lg font-bold text-white leading-snug mb-2 group-hover:text-blue-100 transition-colors">
                  {article.title}
                </h2>
                <p className="text-sm leading-relaxed flex-1 mb-4" style={{ color: "#64748b" }}>
                  {article.excerpt}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: "#475569" }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {article.readLabel ?? `${article.readMinutes} min read`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
