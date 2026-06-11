import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FB_NARROW_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_BG_CANVAS,
  FNO_CARD_BG,
  FNO_CARD_BORDER,
  FNO_CTA_GRADIENT,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";

export function FnoNinjaLegalBackLink() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-sm mb-12 transition-colors hover:text-white w-fit"
      style={{ color: FNO_MUTED }}
    >
      <ArrowLeft className="h-4 w-4" /> Back to home
    </Link>
  );
}

export function FnoNinjaLegalBadge({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
      style={{
        backgroundColor: "rgba(37,99,235,0.1)",
        border: "1px solid rgba(96,165,250,0.2)",
        color: "#93c5fd",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

export function FnoNinjaLegalTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-4 leading-tight text-white">
      {children}
    </h1>
  );
}

export function FnoNinjaLegalIntro({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
      {children}
    </p>
  );
}

export function FnoNinjaLegalMeta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mb-16" style={{ color: "#475569" }}>
      {children}
    </p>
  );
}

export function FnoNinjaLegalPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${FB_NARROW_SHELL} py-12 sm:py-20 min-w-0`}>{children}</div>
  );
}

export function FnoNinjaLegalSections({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function FnoNinjaLegalSection({
  title,
  icon,
  children,
  highlight,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-10"
      style={{
        backgroundColor: FNO_CARD_BG,
        border: highlight ? "1px solid rgba(251,191,36,0.25)" : FNO_CARD_BORDER,
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <span style={{ color: highlight ? "#fbbf24" : FNO_ACCENT }}>{icon}</span>
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </div>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function LegalHighlight({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-slate-200">{children}</span>;
}

export function LegalBullet({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span style={{ color: FNO_ACCENT }}>·</span> {item}
        </li>
      ))}
    </ul>
  );
}

export function LegalProhibited({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span style={{ color: "#ef4444" }}>✕</span> {item}
        </li>
      ))}
    </ul>
  );
}

export function FnoNinjaLegalFooter() {
  return (
    <footer className="py-10 mt-16" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs" style={{ color: "#334155" }}>
          © {new Date().getFullYear()} FNONINJA
        </p>
        <div className="flex gap-6">
          <Link href="/privacy" className="text-xs transition-colors hover:text-white" style={{ color: "#475569" }}>
            Privacy
          </Link>
          <Link href="/terms" className="text-xs transition-colors hover:text-white" style={{ color: "#475569" }}>
            Terms
          </Link>
          <Link href="/contact" className="text-xs transition-colors hover:text-white" style={{ color: "#475569" }}>
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}

export const FNO_LEGAL_INPUT_STYLE = {
  backgroundColor: FNO_BG_CANVAS,
  border: "1px solid rgba(90,140,220,0.2)",
  color: "#f0f4ff",
  fontSize: "16px",
} as const;

export const FNO_LEGAL_CTA_STYLE = {
  background: FNO_CTA_GRADIENT,
  boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
} as const;
