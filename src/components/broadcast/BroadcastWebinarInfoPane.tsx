"use client";

import { TrendingUp } from "lucide-react";
import {
  FNO_ACCENT,
  FNO_BG_CANVAS,
  FNO_BG_TEXTURE,
  FNO_BG_TEXTURE_SIZE,
  FNO_CTA_GRADIENT,
  FNO_MUTED,
  FNO_TEXT,
} from "@/lib/fnoninja/theme";
import { WEBINAR_PUBLIC_URL } from "@/lib/fnoninja/webinar";

const PANE_BORDER = "1px solid rgba(90,140,220,0.2)";

const INFO_PANE_CSS = `
@keyframes broadcast-info-fade {
  0% { opacity: 0; transform: translateX(1.4vh); }
  100% { opacity: 1; transform: translateX(0); }
}
.broadcast-info-pane-enter { animation: broadcast-info-fade 700ms ease both; }
`;

/**
 * Webinar CTA — info pane only (right rail). Same sharp borders + grid as stock slide.
 */
export function BroadcastWebinarInfoPane() {
  const url = WEBINAR_PUBLIC_URL.replace("https://", "");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INFO_PANE_CSS }} />
      <div
        className="broadcast-info-pane-enter relative flex h-full min-h-0 overflow-hidden"
        style={{
          backgroundColor: FNO_BG_CANVAS,
          backgroundImage: FNO_BG_TEXTURE,
          backgroundSize: FNO_BG_TEXTURE_SIZE,
        }}
      >
        {/* Vertical FREE WEBINAR pill */}
        <div
          className="relative z-10 flex shrink-0 items-center justify-center font-black"
          style={{
            width: "5vh",
            background: FNO_CTA_GRADIENT,
            borderRight: PANE_BORDER,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "1.55vh",
            letterSpacing: "0.16em",
            color: FNO_TEXT,
          }}
        >
          FREE WEBINAR
        </div>

        {/* Main content */}
        <div
          className="relative z-10 flex flex-1 flex-col min-w-0 min-h-0"
          style={{ padding: "2.2vh 2.4vh 1.8vh 2vh" }}
        >
          <div className="shrink-0">
            <h2
              className="font-serif font-bold leading-none"
              style={{ fontSize: "4.2vh", color: FNO_TEXT, letterSpacing: "-0.02em" }}
            >
              FREE
            </h2>
            <p
              className="font-serif font-bold leading-tight"
              style={{ fontSize: "3vh", color: FNO_TEXT, marginTop: "0.4vh" }}
            >
              1-Hour Webinar
            </p>
            <div className="flex items-start" style={{ gap: "1vh", marginTop: "1.6vh" }}>
              <p
                className="font-medium leading-snug flex-1 min-w-0"
                style={{ fontSize: "1.75vh", color: "#cbd5f5" }}
              >
                Learn to read option wall support and resistance levels
              </p>
              <TrendingUp
                className="shrink-0"
                style={{ width: "2.4vh", height: "2.4vh", color: FNO_ACCENT }}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
          </div>

          {/* QR card — sharp border, no glow */}
          <div className="flex flex-1 flex-col items-center justify-center min-h-0" style={{ margin: "1.4vh 0" }}>
            <div
              className="flex flex-col items-center w-full rounded-lg"
              style={{
                maxWidth: "100%",
                padding: "2vh 1.8vh",
                background: "rgba(255,255,255,0.03)",
                border: PANE_BORDER,
              }}
            >
              <span
                className="font-black uppercase tracking-[0.18em]"
                style={{ fontSize: "1.45vh", color: FNO_TEXT, marginBottom: "1.4vh" }}
              >
                Scan to Join
              </span>
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  padding: "0.85vh",
                  background: "#fff",
                  border: PANE_BORDER,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: "13.5vh",
                    height: "13.5vh",
                    backgroundImage: "url(/fnoninja/webinar-qr.svg)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="shrink-0 text-center" style={{ marginTop: "auto" }}>
            <p
              className="font-black"
              style={{ fontSize: "2.1vh", color: FNO_ACCENT, letterSpacing: "0.01em" }}
            >
              {url}
            </p>
            <p style={{ fontSize: "1.45vh", color: "#94a3b8", fontWeight: 600, marginTop: "0.9vh" }}>
              Live every evening at 8 PM IST
            </p>
            <p
              style={{
                fontSize: "1.15vh",
                color: FNO_MUTED,
                fontWeight: 600,
                marginTop: "1.2vh",
                letterSpacing: "0.03em",
              }}
            >
              Educational data · not investment advice
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
