/**
 * Generate FNONINJA social profile pics + banners at each platform's recommended size.
 * Run: npx tsx scripts/build-fnoninja-social-assets.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public/fnoninja/social");

const BRAND = {
  bg: "#070d1a",
  bgDeep: "#080f1e",
  logoBlue: "#3b82f6",
  accent: "#60a5fa",
  text: "#f0f4ff",
  muted: "#94a3b8",
  grid: "rgba(255,255,255,0.028)",
} as const;

const TAGLINE = "Option-chain analytics for NSE F&O";

type SocialAsset = {
  file: string;
  width: number;
  height: number;
  kind: "profile" | "banner";
  note?: string;
};

type SocialPlatform = {
  folder: string;
  label: string;
  assets: SocialAsset[];
};

/** Platform specs — upload sizes as of 2025–2026. */
const PLATFORMS: SocialPlatform[] = [
  {
    folder: "twitter",
    label: "Twitter / X",
    assets: [
      { file: "profile-400x400.png", width: 400, height: 400, kind: "profile" },
      {
        file: "banner-1500x500.png",
        width: 1500,
        height: 500,
        kind: "banner",
        note: "Header image (3:1). Keep key text away from bottom-left (avatar overlap on mobile).",
      },
    ],
  },
  {
    folder: "facebook",
    label: "Facebook",
    assets: [
      {
        file: "profile-320x320.png",
        width: 320,
        height: 320,
        kind: "profile",
        note: "Page profile photo. Displays circular; upload square.",
      },
      {
        file: "cover-820x312.png",
        width: 820,
        height: 312,
        kind: "banner",
        note: "Page cover photo. Safe zone: center; logo overlaps bottom-left on mobile.",
      },
    ],
  },
  {
    folder: "linkedin",
    label: "LinkedIn",
    assets: [
      { file: "profile-400x400.png", width: 400, height: 400, kind: "profile" },
      {
        file: "banner-1584x396.png",
        width: 1584,
        height: 396,
        kind: "banner",
        note: "Cover 1584×396. Branding centered right of profile-photo overlap (~220px left).",
      },
    ],
  },
  {
    folder: "youtube",
    label: "YouTube",
    assets: [
      {
        file: "profile-800x800.png",
        width: 800,
        height: 800,
        kind: "profile",
        note: "Channel icon. Displays circular.",
      },
      {
        file: "banner-2560x1440.png",
        width: 2560,
        height: 1440,
        kind: "banner",
        note: "Channel art 2560×1440. Logo + wordmark + tagline centered in 1546×423 safe area.",
      },
    ],
  },
  {
    folder: "instagram",
    label: "Instagram",
    assets: [
      {
        file: "profile-320x320.png",
        width: 320,
        height: 320,
        kind: "profile",
        note: "Profile photo only — Instagram has no profile banner. Displays as a circle.",
      },
    ],
  },
  {
    folder: "reddit",
    label: "Reddit",
    assets: [
      { file: "profile-256x256.png", width: 256, height: 256, kind: "profile" },
      {
        file: "banner-1920x384.png",
        width: 1920,
        height: 384,
        kind: "banner",
        note: "Profile banner (5:1). Avatar overlaps bottom-left.",
      },
    ],
  },
];

function gridPattern(id: string, cell: number): string {
  return `
    <pattern id="${id}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">
      <path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="${BRAND.grid}" stroke-width="1"/>
    </pattern>`;
}

function logoMarkG(id = "logo"): string {
  return `
    <g id="${id}">
      <rect width="32" height="32" rx="8" fill="${BRAND.logoBlue}"/>
      <rect x="11.8" y="11.8" width="8.4" height="8.4" rx="0.56" transform="rotate(45 16 16)" fill="${BRAND.bgDeep}"/>
    </g>`;
}

function profileSvg(size: number): string {
  const logoScale = size * 0.58;
  const cx = size / 2;
  const cy = size / 2;
  const cell = Math.max(24, Math.round(size / 16));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="rgba(37,99,235,0.22)"/>
      <stop offset="100%" stop-color="rgba(37,99,235,0)"/>
    </radialGradient>
    ${gridPattern("grid", cell)}
    ${logoMarkG()}
  </defs>
  <rect width="${size}" height="${size}" fill="${BRAND.bg}"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <rect width="${size}" height="${size}" fill="url(#grid)"/>
  <g transform="translate(${cx - logoScale / 2}, ${cy - logoScale / 2}) scale(${logoScale / 32})">
    <use href="#logo"/>
  </g>
</svg>`;
}

function bannerBrandBlock(params: {
  blockX: number;
  midY: number;
  logoBox: number;
  gap: number;
  textX: number;
  titleSize: number;
  tagSize: number;
  titleY: number;
  tagY: number;
}): string {
  const { blockX, midY, logoBox, textX, titleSize, tagSize, titleY, tagY } = params;
  const logoY = midY - logoBox / 2;
  return `
  <g transform="translate(${blockX}, ${logoY}) scale(${logoBox / 32})">
    <use href="#wm"/>
  </g>
  <text x="${textX}" y="${titleY}"
    font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${titleSize}" letter-spacing="0.05em">
    <tspan fill="${BRAND.text}">FNO</tspan><tspan fill="${BRAND.accent}">NINJA</tspan>
  </text>
  <text x="${textX}" y="${tagY}"
    font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-weight="600" font-size="${tagSize}" fill="${BRAND.muted}">
    ${escapeXml(TAGLINE)}
  </text>`;
}

/** Wide short banners — keep branding inside safe area (profile avatar overlaps bottom-left). */
function wideBannerSvg(
  width: number,
  height: number,
  profileInsetLeft: number,
  profileInsetBottom = 0,
): string {
  const cell = Math.max(20, Math.round(height / 14));
  const padR = Math.max(32, Math.round(width * 0.04));
  const padT = Math.max(12, Math.round(height * 0.1));

  const safeX = profileInsetLeft;
  const safeW = width - profileInsetLeft - padR;
  const safeH = height - profileInsetBottom - padT;

  const logoBox = Math.min(Math.round(safeH * 0.7), Math.round(height * 0.46));
  const titleSize = Math.min(Math.round(logoBox * 0.56), Math.round(height * 0.32));
  const tagSize = Math.min(Math.max(14, Math.round(titleSize * 0.36)), Math.round(height * 0.17));
  const gap = Math.max(16, Math.round(logoBox * 0.26));
  const textBlockW = Math.min(560, Math.round(safeW * 0.58));
  const blockW = logoBox + gap + textBlockW;
  const blockX = safeX + Math.max(0, (safeW - blockW) / 2);
  const midY = padT + safeH / 2;
  const textX = blockX + logoBox + gap;
  const textBlockH = titleSize + 10 + tagSize;
  const textTop = midY - textBlockH / 2;
  const titleY = textTop + titleSize * 0.88;
  const tagY = textTop + titleSize + 10 + tagSize * 0.82;

  const wmSize = Math.min(Math.round(height * 0.85), 140);
  const wmX = width - wmSize - padR;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.logoBlue}"/>
      <stop offset="100%" stop-color="${BRAND.accent}"/>
    </linearGradient>
    <radialGradient id="safeGlow" cx="${((safeX + safeW / 2) / width * 100).toFixed(1)}%" cy="50%" r="55%">
      <stop offset="0%" stop-color="rgba(37,99,235,0.12)"/>
      <stop offset="100%" stop-color="rgba(37,99,235,0)"/>
    </radialGradient>
    ${gridPattern("grid", cell)}
    ${logoMarkG("wm")}
  </defs>
  <rect width="${width}" height="${height}" fill="${BRAND.bg}"/>
  <rect x="${safeX}" y="${padT}" width="${safeW}" height="${safeH}" fill="url(#safeGlow)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <rect x="0" y="${height - 3}" width="${width}" height="3" fill="url(#accentBar)" opacity="0.75"/>
  <g transform="translate(${wmX}, ${midY - wmSize / 2}) scale(${wmSize / 32})" opacity="0.1">
    <use href="#wm"/>
  </g>
  ${bannerBrandBlock({ blockX, midY, logoBox, gap, textX, titleSize, tagSize, titleY, tagY })}
</svg>`;
}

/** LinkedIn 1584×396 — profile photo overlaps bottom-left (~220px). */
function linkedinBannerSvg(): string {
  return wideBannerSvg(1584, 396, 220, 12);
}

function bannerSvg(width: number, height: number): string {
  const cell = Math.max(32, Math.round(height / 12));
  const padX = Math.round(width * 0.06);
  const padY = Math.round(height * 0.22);
  const logoBox = Math.round(height * 0.62);
  const titleSize = Math.round(height * 0.28);
  const tagSize = Math.round(height * 0.13);
  const watermark = Math.round(height * 1.1);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.logoBlue}"/>
      <stop offset="100%" stop-color="${BRAND.accent}"/>
    </linearGradient>
    <radialGradient id="bannerGlow" cx="78%" cy="30%" r="55%">
      <stop offset="0%" stop-color="rgba(37,99,235,0.18)"/>
      <stop offset="100%" stop-color="rgba(37,99,235,0)"/>
    </radialGradient>
    ${gridPattern("grid", cell)}
    ${logoMarkG("wm")}
  </defs>
  <rect width="${width}" height="${height}" fill="${BRAND.bg}"/>
  <rect width="${width}" height="${height}" fill="url(#bannerGlow)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <rect x="0" y="${height - 3}" width="${width}" height="3" fill="url(#accentBar)" opacity="0.85"/>
  <g transform="translate(${width - watermark - padX}, ${(height - watermark) / 2}) scale(${watermark / 32})" opacity="0.14">
    <use href="#wm"/>
  </g>
  <g transform="translate(${padX}, ${padY}) scale(${logoBox / 32})">
    <use href="#wm"/>
  </g>
  <text x="${padX + logoBox + Math.round(height * 0.08)}" y="${padY + Math.round(titleSize * 0.92)}"
    font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${titleSize}" letter-spacing="0.04em">
    <tspan fill="${BRAND.text}">FNO</tspan><tspan fill="${BRAND.accent}">NINJA</tspan>
  </text>
  <text x="${padX + logoBox + Math.round(height * 0.08)}" y="${padY + logoBox - Math.round(tagSize * 0.35)}"
    font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-weight="600" font-size="${tagSize}" fill="${BRAND.muted}">
    ${escapeXml(TAGLINE)}
  </text>
</svg>`;
}

/** YouTube 2560×1440 — all branding inside centered 1546×423 safe area (mobile + desktop). */
function youtubeBannerSvg(): string {
  const W = 2560;
  const H = 1440;
  /** YouTube “viewable on all devices” safe rectangle. */
  const SAFE_W = 1546;
  const SAFE_H = 423;
  const safeX = (W - SAFE_W) / 2;
  const safeY = (H - SAFE_H) / 2;
  const cell = 48;

  const logoBox = 120;
  const gap = 36;
  const titleSize = 72;
  const tagSize = 26;
  /** Approximate text block width — keeps logo + wordmark + tagline inside safe area. */
  const textBlockW = 640;
  const blockW = logoBox + gap + textBlockW;
  const blockX = safeX + (SAFE_W - blockW) / 2;
  const midY = safeY + SAFE_H / 2;
  const logoY = midY - logoBox / 2;
  const textX = blockX + logoBox + gap;
  const textBlockH = titleSize + 14 + tagSize;
  const textTop = midY - textBlockH / 2;
  const titleY = textTop + titleSize * 0.88;
  const tagY = textTop + titleSize + 14 + tagSize * 0.82;

  const wmSize = 200;
  const wmLeftX = safeX - wmSize - 80;
  const wmRightX = safeX + SAFE_W + 80;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND.logoBlue}"/>
      <stop offset="100%" stop-color="${BRAND.accent}"/>
    </linearGradient>
    <radialGradient id="safeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(37,99,235,0.14)"/>
      <stop offset="100%" stop-color="rgba(37,99,235,0)"/>
    </radialGradient>
    ${gridPattern("grid", cell)}
    ${logoMarkG("wm")}
  </defs>
  <rect width="${W}" height="${H}" fill="${BRAND.bg}"/>
  <rect x="${safeX}" y="${safeY}" width="${SAFE_W}" height="${SAFE_H}" fill="url(#safeGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#accentBar)" opacity="0.7"/>
  <g transform="translate(${wmLeftX}, ${midY - wmSize / 2}) scale(${wmSize / 32})" opacity="0.08">
    <use href="#wm"/>
  </g>
  <g transform="translate(${wmRightX}, ${midY - wmSize / 2}) scale(${wmSize / 32})" opacity="0.08">
    <use href="#wm"/>
  </g>
  ${bannerBrandBlock({ blockX, midY, logoBox, gap, textX, titleSize, tagSize, titleY, tagY })}
</svg>`;
}

function bannerSvgForPlatform(platform: string, width: number, height: number): string {
  if (platform === "youtube" && width === 2560) return youtubeBannerSvg();
  if (platform === "linkedin" && width === 1584) return linkedinBannerSvg();
  if (platform === "facebook") return wideBannerSvg(width, height, 96, 8);
  if (platform === "reddit") return wideBannerSvg(width, height, 168, 10);
  if (platform === "twitter") return wideBannerSvg(width, height, 200, 0);
  return bannerSvg(width, height);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderPng(svg: string, outPath: string, width: number, height: number): Promise<void> {
  await sharp(Buffer.from(svg)).resize(width, height).png({ compressionLevel: 9 }).toFile(outPath);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const manifest: {
    generatedAt: string;
    brand: string;
    tagline: string;
    platforms: Array<{
      folder: string;
      label: string;
      assets: Array<SocialAsset & { path: string }>;
    }>;
  } = {
    generatedAt: new Date().toISOString(),
    brand: "FNONINJA",
    tagline: TAGLINE,
    platforms: [],
  };

  for (const platform of PLATFORMS) {
    const platformDir = path.join(OUT_DIR, platform.folder);
    await fs.mkdir(platformDir, { recursive: true });

    const entry = {
      folder: platform.folder,
      label: platform.label,
      assets: [] as Array<SocialAsset & { path: string }>,
    };

    for (const asset of platform.assets) {
      const relPath = `public/fnoninja/social/${platform.folder}/${asset.file}`;
      const outPath = path.join(process.cwd(), relPath);
      const svg =
        asset.kind === "profile"
          ? profileSvg(asset.width)
          : bannerSvgForPlatform(platform.folder, asset.width, asset.height);

      await renderPng(svg, outPath, asset.width, asset.height);
      entry.assets.push({ ...asset, path: relPath });
      console.log(`✓ ${relPath}`);
    }

    manifest.platforms.push(entry);
  }

  const readme = `# FNONINJA social media assets

Branded profile photos and banners for each platform, sized to **recommended upload dimensions**.

**Tagline:** ${TAGLINE}

## Regenerate

\`\`\`bash
npx tsx scripts/build-fnoninja-social-assets.ts
\`\`\`

## Files

| Platform | File | Size | Use |
|----------|------|------|-----|
${manifest.platforms
  .flatMap((p) =>
    p.assets.map(
      (a) =>
        `| ${p.label} | \`${p.folder}/${a.file}\` | ${a.width}×${a.height} | ${a.kind === "profile" ? "Profile photo" : "Cover / banner"}${a.note ? ` — ${a.note}` : ""} |`,
    ),
  )
  .join("\n")}

## Notes

- **Instagram** has no profile banner — only \`profile-320x320.png\` is provided.
- **LinkedIn** cover keeps logo + wordmark + tagline **right of the profile-photo zone** (220px inset) and vertically centered in 1584×396.
- **YouTube** channel art is 2560×1440; **all branding sits in the centered 1546×423 safe area** so mobile/desktop crops stay intact. Outer areas are decorative only.
- **Twitter / X, Facebook, Reddit:** same wide-banner safe layout — avatar overlaps bottom-left; branding is inset and centered in the remaining area.
- Profile images render as **circles** on most platforms; artwork is centered on a square canvas.

## Brand colors

- Background: \`${BRAND.bg}\`
- Logo blue: \`${BRAND.logoBlue}\`
- Accent: \`${BRAND.accent}\`
- Text: \`${BRAND.text}\`
`;

  await fs.writeFile(path.join(OUT_DIR, "README.md"), readme, "utf8");
  await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nDone — assets in public/fnoninja/social/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
