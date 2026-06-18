"use client";

import { WEBINAR_PUBLIC_URL } from "@/lib/fnoninja/webinar";

const INTERSTITIAL_CSS = `
@keyframes broadcast-webinar-glow {
  0%, 100% { opacity: 0.45; transform: translateY(0); }
  50% { opacity: 0.75; transform: translateY(-1vh); }
}
.broadcast-webinar-wave { animation: broadcast-webinar-glow 6s ease-in-out infinite; }
`;

/**
 * Webinar CTA interstitial — shown on the right pane between stock pages.
 * Glass QR card + headline; policy-safe copy only.
 */
export function BroadcastWebinarInterstitial() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INTERSTITIAL_CSS }} />

      {/* Left — branded backdrop + headline */}
      <section
        className="relative flex flex-col min-h-0 self-stretch overflow-hidden rounded-xl"
        style={{ flex: "3 1 0%", minHeight: 0, background: "#070d1a" }}
      >
        {/* Teal wave accents */}
        <div
          className="broadcast-webinar-wave pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 55% 40% at 85% 15%, rgba(45,212,191,0.22), transparent),
              radial-gradient(ellipse 50% 35% at 10% 90%, rgba(56,189,248,0.18), transparent)
            `,
          }}
        />
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full opacity-30"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,280 Q200,180 400,240 T800,200 L800,400 L0,400 Z"
            fill="none"
            stroke="rgba(45,212,191,0.35)"
            strokeWidth="2"
          />
          <path
            d="M0,320 Q250,220 500,280 T800,260"
            fill="none"
            stroke="rgba(56,189,248,0.25)"
            strokeWidth="1.5"
          />
        </svg>

        <div className="relative z-10 flex flex-1 items-center" style={{ padding: "3vh 4vh", gap: "3vh" }}>
          {/* Vertical FREE WEBINAR pill */}
          <div
            className="flex items-center justify-center shrink-0 font-black"
            style={{
              width: "5.5vh",
              alignSelf: "stretch",
              borderRadius: "999px",
              background: "linear-gradient(180deg, #14b8a6, #2563eb)",
              boxShadow: "0 0 32px rgba(45,212,191,0.35)",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "2vh",
              letterSpacing: "0.14em",
              color: "#fff",
            }}
          >
            FREE WEBINAR
          </div>

          <div className="flex flex-col min-w-0" style={{ gap: "2vh" }}>
            <h2
              className="font-serif font-bold text-white leading-tight"
              style={{ fontSize: "5.2vh", letterSpacing: "-0.01em" }}
            >
              FREE 1-Hour Webinar
            </h2>
            <div className="flex items-start" style={{ gap: "1.4vh" }}>
              <span style={{ color: "#2dd4bf", fontSize: "3vh", lineHeight: 1 }} aria-hidden>
                ▲
              </span>
              <p
                className="font-semibold leading-snug"
                style={{ fontSize: "3.2vh", color: "#e2e8f0", maxWidth: "48ch" }}
              >
                Learn to read option wall support and resistance levels
              </p>
            </div>
            <p style={{ fontSize: "1.6vh", color: "#64748b", marginTop: "1vh" }}>
              Live every evening at 8 PM IST · fnoninja.com/webinar
            </p>
          </div>
        </div>

        <p
          className="relative z-10 text-center shrink-0"
          style={{
            padding: "1.6vh",
            fontSize: "1.35vh",
            color: "#475569",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Educational data · not investment advice
        </p>
      </section>

      {/* Right — glass QR card */}
      <aside
        className="flex flex-col items-center justify-center min-h-0 self-stretch rounded-xl"
        style={{
          flex: "2 1 0%",
          padding: "3vh",
          background: "linear-gradient(160deg, rgba(13,27,46,0.92), rgba(8,15,30,0.95))",
          border: "1px solid rgba(45,212,191,0.2)",
        }}
      >
        <div
          className="flex flex-col items-center w-full max-w-full"
          style={{
            padding: "3.5vh 3vh",
            borderRadius: "2vh",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <span
            className="font-bold uppercase tracking-widest"
            style={{ fontSize: "1.8vh", color: "#94a3b8", marginBottom: "2vh" }}
          >
            Scan to Join
          </span>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              padding: "1.2vh",
              background: "#fff",
              boxShadow: "0 0 28px rgba(45,212,191,0.25)",
            }}
          >
            <div
              aria-hidden
              style={{
                width: "22vh",
                height: "22vh",
                backgroundImage: "url(/fnoninja/webinar-qr.svg)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </div>
          <span
            className="font-black text-center"
            style={{ fontSize: "2vh", color: "#f0f4ff", marginTop: "2.4vh", lineHeight: 1.2 }}
          >
            Scan to Join
          </span>
          <span
            className="font-bold text-center"
            style={{ fontSize: "1.85vh", color: "#60a5fa", marginTop: "0.8vh" }}
          >
            {WEBINAR_PUBLIC_URL.replace("https://", "")}
          </span>
        </div>
      </aside>
    </>
  );
}
