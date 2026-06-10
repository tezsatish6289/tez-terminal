import Image from "next/image";
import Link from "next/link";
import { FB_DOC_SHELL } from "@/lib/freedombot/responsive";

export function FnoNinjaFooter() {
  return (
    <footer className="py-14 px-4 sm:px-6" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
      <div className={FB_DOC_SHELL}>
        <div className="grid sm:grid-cols-3 gap-10 mb-12">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <Image
                src="/freedombot/icon.png"
                alt="FNONinja"
                width={32}
                height={32}
                className="rounded-xl object-contain"
              />
              <span className="font-black text-base tracking-tight" style={{ color: "#f0f4ff" }}>
                FNONinja<span style={{ color: "#60a5fa" }}>.com</span>
              </span>
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
                { label: "How it works", href: "#how-it-works" },
                { label: "Features", href: "#features" },
                { label: "Disclaimer", href: "#disclaimer" },
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
                { label: "FreedomBot.ai", href: "https://freedombot.ai", external: true },
                { label: "About", href: "https://freedombot.ai/about", external: true },
                { label: "Contact", href: "https://freedombot.ai/contact", external: true },
                { label: "Privacy", href: "https://freedombot.ai/privacy", external: true },
                { label: "Terms", href: "https://freedombot.ai/terms", external: true },
              ].map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: "#475569" }}
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: "#475569" }}
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="pt-6 text-center" style={{ borderTop: "1px solid rgba(90,140,220,0.06)" }}>
          <p className="text-[11px]" style={{ color: "#1e293b" }}>
            &copy; {new Date().getFullYear()} FNONinja. Powered by{" "}
            <a
              href="https://freedombot.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
              style={{ color: "#475569" }}
            >
              FreedomBot.ai
            </a>
            . All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
