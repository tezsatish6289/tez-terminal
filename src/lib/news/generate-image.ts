import "server-only";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { geminiImage } from "@/lib/news/gemini";
import { INTER_FONTS } from "@/lib/news/fonts";

// fnoninja.com brand tokens (mirror src/lib/fnoninja/theme.ts).
const FNO_BG = "#080f1e";
const FNO_TEXT = "#f0f4ff";
const FNO_ACCENT = "#60a5fa";
const FNO_MUTED = "#94a3b8";

const W = 1080;
const H = 1350; // 4:5 — safe across IG / FB / LinkedIn / X.

/** satori accepts plain element objects ({ type, props }) — no JSX/React needed here. */
type El = { type: string; props: Record<string, unknown> };
function el(type: string, props: Record<string, unknown>, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}

/** Build the branded card: AI background + scrim + wordmark + headline + disclaimer. */
function cardTree(headline: string, bgDataUri: string): El {
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        width: W,
        height: H,
        backgroundColor: FNO_BG,
        backgroundImage: `url(${bgDataUri})`,
        backgroundSize: "1080px 1350px",
        backgroundPosition: "center",
        fontFamily: "Inter",
      },
    },
    [
      // Top brand wordmark.
      el(
        "div",
        {
          style: {
            position: "absolute",
            top: 56,
            left: 64,
            display: "flex",
            alignItems: "center",
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: -1,
          },
        },
        [
          el("span", { style: { color: FNO_TEXT } }, "FNO"),
          el("span", { style: { color: FNO_ACCENT } }, "NINJA"),
        ],
      ),
      // Bottom scrim so the headline is always legible over any image.
      el("div", {
        style: {
          position: "absolute",
          bottom: 0,
          left: 0,
          width: W,
          height: 760,
          display: "flex",
          backgroundImage:
            "linear-gradient(180deg, rgba(8,15,30,0) 0%, rgba(8,15,30,0.55) 38%, rgba(8,15,30,0.92) 100%)",
        },
      }),
      // Headline + disclaimer block.
      el(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "0 64px 84px 64px",
            zIndex: 1,
          },
        },
        [
          el("div", {
            style: {
              width: 96,
              height: 8,
              borderRadius: 4,
              marginBottom: 28,
              display: "flex",
              backgroundColor: FNO_ACCENT,
            },
          }),
          el(
            "div",
            {
              style: {
                color: FNO_TEXT,
                fontSize: headline.length > 90 ? 60 : 72,
                fontWeight: 800,
                lineHeight: 1.1,
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
                marginTop: 28,
                color: FNO_MUTED,
                fontSize: 26,
                fontWeight: 600,
                display: "flex",
              },
            },
            "Informational · not investment advice · fnoninja.com",
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
