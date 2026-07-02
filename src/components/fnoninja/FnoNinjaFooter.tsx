import Link from "next/link";
import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { FB_DOC_SHELL } from "@/lib/freedombot/responsive";
import { FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export function FnoNinjaFooter() {
  return (
    <footer className="py-14 px-4 sm:px-6" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
      <div className={FB_DOC_SHELL}>
        <div className="grid sm:grid-cols-3 gap-10 mb-12">
          <div>
            <div className="mb-3">
              <FnoNinjaLogo size={32} wordmarkClassName="text-base" />
            </div>
            <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#334155" }}>
              Option-chain analytics and market data visualization for NSE F&amp;O — derived
              observations for independent research.
            </p>
            <p className="text-[10px] mt-3" style={{ color: "#1e293b" }}>
              Informational only. Not investment advice. Derivatives trading involves substantial
              risk.
            </p>
          </div>

          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: "#334155" }}
            >
              Product
            </p>
            <div className="flex flex-col gap-3">
              {[
                { label: "Analytics dashboard", href: "/levels" },
                { label: "Learn", href: "/learn" },
                { label: "How it works", href: "/#how-it-works" },
                { label: "Pricing", href: "/#pricing" },
                { label: "Disclaimer", href: "/#disclaimer" },
              ].map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-sm transition-colors hover:text-white"
                  style={{ color: "#475569" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: "#334155" }}
            >
              Company
            </p>
            <div className="flex flex-col gap-3">
              {[
                { label: "Contact", href: "/contact" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-sm transition-colors hover:text-white"
                  style={{ color: "#475569" }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 text-center" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
          <p className="text-[11px]" style={{ color: "#1e293b" }}>
            &copy; {new Date().getFullYear()} FNONINJA. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
