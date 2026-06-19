# FNONINJA nightly streamer — headless Chromium + Xvfb + FFmpeg → YouTube RTMP.
# Build from the REPO ROOT so the bundled music clips are in context:
#   docker build -f streamer/Dockerfile -t fnoninja-streamer .
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      xvfb \
      dumb-init \
      ca-certificates \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_BIN=/usr/bin/chromium \
    AUDIO_DIR=/app/audio \
    DISPLAY=:99

WORKDIR /app

COPY streamer/package.json ./package.json
RUN npm install --no-audit --no-fund
ENV NODE_ENV=production

COPY streamer/src ./src
# Bundled royalty-free music clips (shuffled nightly by the controller).
COPY video/public/audio ./audio

# dumb-init reaps the Xvfb/Chromium/FFmpeg children and forwards signals so a
# scheduled stop (SIGTERM) tears the stream down cleanly.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--import", "tsx", "src/run.ts"]
