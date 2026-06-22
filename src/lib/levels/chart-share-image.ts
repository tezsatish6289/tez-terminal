import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { fmtInr, levelsSummary } from "@/lib/levels/levels-share";

const BRAND = {
  bg: "#070d1a",
  accent: "#60a5fa",
  text: "#f0f4ff",
  muted: "#94a3b8",
  footer: "#080f1e",
} as const;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#3b82f6"/><rect x="11.8" y="11.8" width="8.4" height="8.4" rx="0.56" transform="rotate(45 16 16)" fill="#080f1e"/></svg>`;

let logoImagePromise: Promise<HTMLImageElement | null> | null = null;

function loadLogoImage(): Promise<HTMLImageElement | null> {
  if (logoImagePromise) return logoImagePromise;
  logoImagePromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  });
  return logoImagePromise;
}

export async function compositeChartShareImage(
  root: HTMLElement,
  opts: {
    symbol: string;
    subtitle?: string | null;
    shareUrl: string;
    levels?: PublicLevels | null;
  },
): Promise<Blob | null> {
  const rect = root.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w < 120 || h < 120) return null;

  const scale = Math.min(2, Math.max(1, 1200 / w));
  const footerH = 76;
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale + footerH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, outW, outH);

  const canvases = root.querySelectorAll("canvas");
  canvases.forEach((c) => {
    const cr = c.getBoundingClientRect();
    const x = (cr.left - rect.left) * scale;
    const y = (cr.top - rect.top) * scale;
    ctx.drawImage(c, x, y, cr.width * scale, cr.height * scale);
  });

  const footerTop = outH - footerH * scale;
  ctx.fillStyle = BRAND.footer;
  ctx.fillRect(0, footerTop, outW, footerH * scale);
  ctx.fillStyle = "rgba(96,165,250,0.35)";
  ctx.fillRect(0, footerTop, outW, 1 * scale);

  const pad = 14 * scale;
  const logo = await loadLogoImage();
  const logoSize = 28 * scale;
  if (logo) {
    ctx.drawImage(logo, pad, footerTop + pad, logoSize, logoSize);
  }

  const textX = pad + logoSize + 10 * scale;
  ctx.fillStyle = BRAND.text;
  ctx.font = `700 ${14 * scale}px system-ui, sans-serif`;
  const sym = opts.symbol.trim().toUpperCase();
  const headline =
    opts.subtitle && opts.subtitle.toUpperCase() !== sym
      ? `${sym} · ${opts.subtitle}`
      : sym;
  ctx.fillText(headline, textX, footerTop + pad + 12 * scale);

  ctx.fillStyle = BRAND.accent;
  ctx.font = `800 ${11 * scale}px system-ui, sans-serif`;
  ctx.fillText("FNONINJA", textX, footerTop + pad + 28 * scale);

  const summary = levelsSummary(opts.levels);
  if (summary) {
    ctx.fillStyle = BRAND.muted;
    ctx.font = `500 ${10 * scale}px system-ui, sans-serif`;
    ctx.fillText(summary, textX, footerTop + pad + 44 * scale);
  }

  ctx.fillStyle = BRAND.muted;
  ctx.font = `500 ${9 * scale}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  const urlLabel = opts.shareUrl.replace(/^https?:\/\//, "");
  ctx.fillText(urlLabel, outW - pad, footerTop + pad + 28 * scale);
  ctx.textAlign = "left";

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
  });
}
