# FNONINJA video renderer — Cloud Run Job image.
# Renders a Remotion composition headlessly (Chromium + ffmpeg) and publishes the
# MP4 to Firebase Storage. Triggered per-execution with env overrides (see
# scripts/cloud-render.mjs and scripts/deploy-video-renderer.sh).

FROM node:22-bookworm-slim

# System libraries Chromium (Remotion's headless browser) needs to run.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 \
    libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
    libpango-1.0-0 libcairo2 libcups2 fonts-liberation fonts-noto-color-emoji \
    ca-certificates wget bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# App sources.
COPY . .

# Pre-download the Chromium Headless Shell so the first render doesn't pay for it.
RUN npx remotion browser ensure

ENV NODE_ENV=production
# Remotion respects this for the bundled Chromium location.
ENV REMOTION_CHROME_MODE=headless-shell

CMD ["node", "scripts/cloud-render.mjs"]
