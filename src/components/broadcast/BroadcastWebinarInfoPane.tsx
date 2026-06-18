"use client";

import { WEBINAR_PUBLIC_URL } from "@/lib/fnoninja/webinar";

const INFO_PANE_CSS = `
@keyframes broadcast-info-fade {
  0% { opacity: 0; transform: translateX(1.2vh); }
  100% { opacity: 1; transform: translateX(0); }
}
.broadcast-info-pane-enter { animation: broadcast-info-fade 700ms ease both; }
`;

/**
 * Webinar CTA — info pane only (right rail). Chart stays on the left.
 */
export function BroadcastWebinarInfoPane() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INFO_PANE_CSS }} />
      <div className="broadcast-info-pane-enter flex flex-col h-full min-h-0">
        {/* Vertical pill + headline */}
        <div className="flex items-stretch shrink-0" style={{ gap: "1.6vh" }}>
          <div
            className="flex items-center justify-center shrink-0 font-black"
            style={{
              width: "4.2vh",
              borderRadius: "999px",
              background: "linear-gradient(180deg, #14b8a6, #2563eb)",
              boxShadow: "0 0 20px rgba(45,212,191,0.3)",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "1.45vh",
              letterSpacing: "0.12em",
              color: "#fff",
            }}
          >
            FREE WEBINAR
          </div>
          <div className="flex flex-col min-w-0 justify-center" style={{ gap: "1vh" }}>
            <h2
              className="font-serif font-bold text-white leading-tight"
              style={{ fontSize: "2.8vh" }}
            >
              FREE 1-Hour Webinar
            </h2>
            <div className="flex items-start" style={{ gap: "0.9vh" }}>
              <span style={{ color: "#2dd4bf", fontSize: "1.8vh", lineHeight: 1.2 }} aria-hidden>
                ▲
              </span>
              <p
                className="font-semibold leading-snug"
                style={{ fontSize: "1.85vh", color: "#e2e8f0" }}
              >
                Learn to read option wall support and resistance levels
              </p>
            </div>
          </div>
        </div>

        {/* Glass QR card */}
        <div
          className="flex flex-col items-center justify-center flex-1 min-h-0"
          style={{ marginTop: "2vh" }}
        >
          <div
            className="flex flex-col items-center w-full"
            style={{
              padding: "2.4vh 2vh",
              borderRadius: "1.6vh",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <span
              className="font-bold uppercase tracking-widest"
              style={{ fontSize: "1.35vh", color: "#94a3b8", marginBottom: "1.4vh" }}
            >
              Scan to Join
            </span>
            <div
              className="rounded-lg overflow-hidden"
              style={{
                padding: "0.9vh",
                background: "#fff",
                boxShadow: "0 0 20px rgba(45,212,191,0.22)",
              }}
            >
              <div
                aria-hidden
                style={{
                  width: "14vh",
                  height: "14vh",
                  backgroundImage: "url(/fnoninja/webinar-qr.svg)",
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              />
            </div>
            <span
              className="font-black text-center"
              style={{ fontSize: "1.6vh", color: "#f0f4ff", marginTop: "1.6vh" }}
            >
              Scan to Join
            </span>
            <span
              className="font-bold text-center"
              style={{ fontSize: "1.45vh", color: "#60a5fa", marginTop: "0.5vh" }}
            >
              {WEBINAR_PUBLIC_URL.replace("https://", "")}
            </span>
          </div>
          <p
            className="text-center shrink-0"
            style={{
              marginTop: "1.6vh",
              fontSize: "1.2vh",
              color: "#475569",
              fontWeight: 600,
            }}
          >
            Live every evening at 8 PM IST
          </p>
        </div>

        <p
          className="text-center shrink-0"
          style={{ fontSize: "1.15vh", color: "#475569", fontWeight: 600, marginTop: "auto" }}
        >
          Educational data · not investment advice
        </p>
      </div>
    </>
  );
}
