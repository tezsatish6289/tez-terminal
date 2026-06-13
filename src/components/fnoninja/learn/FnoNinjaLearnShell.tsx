import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { FNO_LEARN_ARTICLE_SHELL, FNO_LEARN_WIDE_SHELL } from "@/lib/freedombot/responsive";
import { FnoNinjaLearnDisclaimer } from "@/components/fnoninja/learn/FnoNinjaLearnDisclaimer";
import type { LearnArticleMeta } from "@/lib/fnoninja/learn-content";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaLearnArticleShell({
  article,
  learnHubHref,
  disclaimerPlacement = "top",
  disclaimerParagraphs,
  shell = "article",
  children,
}: {
  article: LearnArticleMeta;
  learnHubHref: string;
  /** Default top; science guide uses bottom so readers see content first. */
  disclaimerPlacement?: "top" | "bottom" | "none";
  disclaimerParagraphs?: string[];
  /** `wide` — full viewport width for embedded live demos (Liveslide learn page). */
  shell?: "article" | "wide";
  children: React.ReactNode;
}) {
  const Icon = article.icon;
  const shellClass = shell === "wide" ? FNO_LEARN_WIDE_SHELL : FNO_LEARN_ARTICLE_SHELL;

  return (
    <article className={`${shellClass} py-10 sm:py-16 min-w-0`}>
      <Link
        href={learnHubHref}
        className="flex items-center gap-2 text-sm mb-8 transition-colors hover:text-white w-fit"
        style={{ color: FNO_MUTED }}
      >
        <ArrowLeft className="h-4 w-4" /> All guides
      </Link>

      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
        style={{
          backgroundColor: "rgba(37,99,235,0.1)",
          border: "1px solid rgba(96,165,250,0.2)",
          color: "#93c5fd",
        }}
      >
        <Icon className="h-3.5 w-3.5" />
        {article.tag}
      </div>

      <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1] mb-4">
        {article.title}
      </h1>

      <div className="flex flex-wrap items-center gap-3 text-xs mb-6" style={{ color: "#64748b" }}>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {article.readLabel ?? `${article.readMinutes} min read`}
        </span>
      </div>

      <p className="text-base leading-relaxed mb-8" style={{ color: "#94a3b8" }}>
        {article.excerpt}
      </p>

      {disclaimerPlacement === "top" ? (
        <FnoNinjaLearnDisclaimer className="mb-10" paragraphs={disclaimerParagraphs} />
      ) : null}

      <div className="space-y-8">{children}</div>

      {disclaimerPlacement === "bottom" ? (
        <FnoNinjaLearnDisclaimer className="mt-10" paragraphs={disclaimerParagraphs} />
      ) : null}

      <div
        className="mt-12 rounded-2xl p-6 sm:p-8"
        style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
      >
        <p className="text-sm font-semibold text-white mb-2">Ready to explore?</p>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
          Open the market map or a symbol chart and compare what you see with this guide — always
          using your own judgment.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/levels"
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
          >
            Open market map
          </Link>
          <Link
            href="/levels/chart?scope=index&symbol=NIFTY"
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold"
            style={{ color: FNO_ACCENT, border: "1px solid rgba(96,165,250,0.35)" }}
          >
            Sample NIFTY chart
          </Link>
        </div>
      </div>
    </article>
  );
}

export function LearnSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-6 sm:p-8"
      style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
    >
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </section>
  );
}

export function LearnLead({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] sm:text-base leading-relaxed text-slate-300">{children}</p>;
}

export function LearnBulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 pl-1">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className="shrink-0 font-bold" style={{ color: FNO_ACCENT }}>
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LearnTerm({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 sm:p-5"
      style={{ backgroundColor: "rgba(8,15,30,0.45)", border: "1px solid rgba(90,140,220,0.12)" }}
    >
      <h3 className="text-base font-bold text-white mb-2">{term}</h3>
      <div className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </div>
  );
}

export function LearnSteps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-6">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-4">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
            style={{
              backgroundColor: "rgba(37,99,235,0.15)",
              color: FNO_ACCENT,
              border: "1px solid rgba(96,165,250,0.25)",
            }}
          >
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-base font-bold text-white mb-1.5">{step.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
