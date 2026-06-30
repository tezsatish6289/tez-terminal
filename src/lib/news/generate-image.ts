import "server-only";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { geminiImage } from "@/lib/news/gemini";
import { INTER_FONTS } from "@/lib/news/fonts";

const FNO_BG = "#080f1e";
const FNO_TEXT = "#f0f4ff";
const FNO_MUTED = "#94a3b8";

const W = 1080;
const H = 1350; // 4:5 — safe across IG / FB / LinkedIn / X.

type Accent = { main: string; glow: string; bar: string; pillBg: string; pillBorder: string };

const ACCENTS: Record<"bullish" | "bearish" | "neutral", Accent> = {
  neutral: {
    main: "#60a5fa",
    glow: "rgba(59,130,246,0.35)",
    bar: "linear-gradient(90deg, #2563eb 0%, #60a5fa 55%, #93c5fd 100%)",
    pillBg: "rgba(37,99,235,0.22)",
    pillBorder: "rgba(96,165,250,0.45)",
  },
  bullish: {
    main: "#34d399",
    glow: "rgba(52,211,153,0.32)",
    bar: "linear-gradient(90deg, #059669 0%, #34d399 55%, #6ee7b7 100%)",
    pillBg: "rgba(16,185,129,0.18)",
    pillBorder: "rgba(52,211,153,0.42)",
  },
  bearish: {
    main: "#fbbf24",
    glow: "rgba(251,191,36,0.28)",
    bar: "linear-gradient(90deg, #d97706 0%, #fbbf24 55%, #fde68a 100%)",
    pillBg: "rgba(245,158,11,0.16)",
    pillBorder: "rgba(251,191,36,0.4)",
  },
};

/** satori accepts plain element objects ({ type, props }) — no JSX/React needed here. */
type El = { type: string; props: Record<string, unknown> };
function el(type: string, props: Record<string, unknown>, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}

/** Tone-aware accent from headline keywords (overlay only — not investment signal). */
export function headlineAccent(headline: string): Accent {
  const h = headline.toLowerCase();
  const bearish =
    /\b(fall|falls|fell|drop|drops|dropped|decline|slump|crash|cut|cuts|miss|misses|downgrade|outflow|weak|loss|losses|bear|selloff|sell-off|tumble|plunge|sink|retreat)\b/.test(
      h,
    );
  const bullish =
    /\b(rise|rises|rose|rally|rallies|surge|surges|gain|gains|jump|jumps|beat|beats|upgrade|inflow|record high|all-time high|strong|bull|rebound|soar|climb|expand|growth)\b/.test(
      h,
    );
  if (bearish && !bullish) return ACCENTS.bearish;
  if (bullish && !bearish) return ACCENTS.bullish;
  return ACCENTS.neutral;
}

function logoMark(): El {
  return el(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: "#2563eb",
        marginRight: 16,
        flexShrink: 0,
      },
    },
    el("div", {
      style: {
        width: 18,
        height: 18,
        borderRadius: 3,
        backgroundColor: FNO_BG,
        transform: "rotate(45deg)",
        display: "flex",
      },
    }),
  );
}

/** Branded card: vivid AI background + editorial overlay. */
function cardTree(headline: string, bgDataUri: string): El {
  const accent = headlineAccent(headline);
  const headlineSize = headline.length > 100 ? 54 : headline.length > 75 ? 62 : 72;

  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        position: "relative",
        width: W,
        height: H,
        backgroundColor: FNO_BG,
        backgroundImage: `url(${bgDataUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        fontFamily: "Inter",
      },
    },
    [
      // Edge vignette — draws the eye to center content.
      el("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse 90% 85% at 50% 42%, rgba(8,15,30,0) 0%, rgba(8,15,30,0.55) 100%)",
        },
      }),
      // Top-right accent glow orb.
      el("div", {
        style: {
          position: "absolute",
          top: -120,
          right: -80,
          width: 520,
          height: 520,
          borderRadius: "50%",
          display: "flex",
          backgroundImage: `radial-gradient(circle, ${accent.glow} 0%, transparent 68%)`,
        },
      }),
      // Top-left cool fill — balances composition.
      el("div", {
        style: {
          position: "absolute",
          top: -60,
          left: -100,
          width: 440,
          height: 440,
          borderRadius: "50%",
          display: "flex",
          backgroundImage: "radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%)",
        },
      }),
      // Header: logo mark + wordmark + news pill.
      el(
        "div",
        {
          style: {
            position: "absolute",
            top: 52,
            left: 56,
            right: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          },
        },
        [
          el(
            "div",
            { style: { display: "flex", alignItems: "center" } },
            [
              logoMark(),
              el(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 4 } },
                [
                  el(
                    "div",
                    { style: { display: "flex", alignItems: "center", fontSize: 38, fontWeight: 800, letterSpacing: -1 } },
                    [
                      el("span", { style: { color: FNO_TEXT } }, "FNO"),
                      el("span", { style: { color: accent.main } }, "NINJA"),
                    ],
                  ),
                  el("div", {
                    style: {
                      display: "flex",
                      color: FNO_MUTED,
                      fontSize: 18,
                      fontWeight: 600,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    },
                  }, "Indian markets"),
                ],
              ),
            ],
          ),
          el(
            "div",
            {
              style: {
                display: "flex",
                padding: "12px 22px",
                borderRadius: 999,
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: 3,
                color: accent.main,
                backgroundColor: accent.pillBg,
                border: `2px solid ${accent.pillBorder}`,
                textTransform: "uppercase",
              },
            },
            "News",
          ),
        ],
      ),
      // Bottom scrim — stronger than before for legibility on busy art.
      el("div", {
        style: {
          position: "absolute",
          bottom: 0,
          left: 0,
          width: W,
          height: 820,
          display: "flex",
          backgroundImage:
            "linear-gradient(180deg, rgba(8,15,30,0) 0%, rgba(8,15,30,0.45) 28%, rgba(8,15,30,0.88) 58%, rgba(8,15,30,0.97) 100%)",
        },
      }),
      // Thin accent frame along bottom edge.
      el("div", {
        style: {
          position: "absolute",
          bottom: 0,
          left: 0,
          width: W,
          height: 6,
          display: "flex",
          backgroundImage: accent.bar,
        },
      }),
      // Headline block.
      el(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "0 56px 88px 56px",
            zIndex: 1,
          },
        },
        [
          el("div", {
            style: {
              width: 128,
              height: 10,
              borderRadius: 5,
              marginBottom: 26,
              display: "flex",
              backgroundImage: accent.bar,
            },
          }),
          el(
            "div",
            {
              style: {
                color: FNO_TEXT,
                fontSize: headlineSize,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: -1.5,
                display: "flex",
              },
            },
            headline,
          ),
          el(
            "div",
            {
              style: {
                marginTop: 30,
                display: "flex",
                alignItems: "center",
                gap: 14,
              },
            },
            [
              el("div", {
                style: {
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  display: "flex",
                  backgroundColor: accent.main,
                },
              }),
              el(
                "div",
                {
                  style: {
                    color: FNO_MUTED,
                    fontSize: 24,
                    fontWeight: 600,
                    display: "flex",
                  },
                },
                "Informational · not investment advice · fnoninja.com",
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

const satoriFonts = INTER_FONTS.map((f) => ({
  name: f.name,
  data: f.data,
  weight: f.weight as 400 | 600 | 700 | 800,
  style: f.style,
}));

/**
 * Generate the AI background, compose the branded overlay, and return PNG bytes
 * (1080×1350). `imagePrompt` drives the background; `headline` is overlaid crisply.
 */
export async function generateNewsImage(input: { headline: string; imagePrompt: string }): Promise<Buffer> {
  const bg = await geminiImage(input.imagePrompt);
  const bgDataUri = `data:image/png;base64,${bg.toString("base64")}`;

  const svg = await satori(cardTree(input.headline, bgDataUri) as unknown as Parameters<typeof satori>[0], {
    width: W,
    height: H,
    fonts: satoriFonts,
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  return Buffer.from(png);
}
