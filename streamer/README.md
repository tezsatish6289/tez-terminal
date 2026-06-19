# FNONINJA nightly streamer

Streams `https://fnoninja.com/broadcast/live?scene=live` to **YouTube Live** every
night (default 60 min), with the 13 bundled royalty-free music clips shuffled and
looped gaplessly. Fully unattended: it creates the YouTube broadcast, pushes the
page via headless Chromium + FFmpeg, sets a thumbnail, then ends cleanly.

```
Xvfb (virtual 1080p display)
  └─ Chromium (kiosk) → /broadcast/live?scene=live
        └─ FFmpeg  x11grab video  +  shuffled MP3 playlist audio
              └─ YouTube RTMP ingest (broadcast auto-starts / auto-stops)
```

## What it does each run

1. Refreshes the Google OAuth token (same creds as the webinar integration).
2. Creates a YouTube broadcast (`enableAutoStart`/`enableAutoStop`) + RTMP stream, binds them.
3. Boots Xvfb + Chromium on the broadcast URL.
4. Captures a thumbnail frame and sets it.
5. FFmpeg streams video+music to YouTube for `DURATION_MIN`.
6. Transitions the broadcast to complete and tears everything down.

## Configuration (env)

| Var | Default | Notes |
|-----|---------|-------|
| `GOOGLE_OAUTH_CLIENT_ID` | — | required (same as webinar) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | required |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | — | required, FNO NINJA channel owner |
| `BROADCAST_URL` | `https://fnoninja.com/broadcast/live?scene=live` | page to capture |
| `PRIVACY` | `public` | `public` / `unlisted` / `private` |
| `DURATION_MIN` | `60` | stream length |
| `WIDTH`/`HEIGHT`/`FPS` | `1920`/`1080`/`30` | |
| `VIDEO_BITRATE` | `4500k` | 1080p30 sweet spot |
| `WARMUP_SEC` | `20` | page load before going live |

## Local sanity check (provisioning only)

You can't render/stream on macOS (needs Xvfb), but you can verify the YouTube
provisioning path with the existing project test, or run the container's
`PROVISION_ONLY` mode on the VM (below). It creates+binds a broadcast and prints
the RTMP target without streaming.

---

## Deploy on a GCP VM (e2-standard-2)

### 1. Create the VM

```bash
gcloud compute instances create fnoninja-streamer \
  --project=studio-6235588950-a15f2 \
  --zone=asia-south1-a \
  --machine-type=e2-standard-2 \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB
```

### 2. Install Docker + build the image

SSH in (`gcloud compute ssh fnoninja-streamer --zone=asia-south1-a`):

```bash
sudo apt-get update && sudo apt-get install -y docker.io git
sudo usermod -aG docker "$USER" && newgrp docker

# Clone the repo (use your GitHub auth) and build from repo root:
git clone https://github.com/tezsatish6289/tez-terminal.git
cd tez-terminal
docker build -f streamer/Dockerfile -t fnoninja-streamer .
```

### 3. Drop in the secrets

```bash
sudo tee /etc/fnoninja-streamer.env >/dev/null <<'EOF'
GOOGLE_OAUTH_CLIENT_ID=632795229776-....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-....
GOOGLE_OAUTH_REFRESH_TOKEN=1//....
PRIVACY=public
DURATION_MIN=60
EOF
sudo chmod 600 /etc/fnoninja-streamer.env
```

### 4. Test it (short, unlisted)

```bash
cd tez-terminal/streamer && chmod +x run-nightly.sh

# 4a. Provisioning only — proves YouTube create+bind works, no stream:
PROVISION_ONLY=1 ./run-nightly.sh

# 4b. 2-minute UNLISTED end-to-end test (check the watch URL it prints):
PRIVACY=unlisted DURATION_MIN=2 ./run-nightly.sh
```

Open the printed `youtube.com/watch?v=...` — you should see the live broadcast
page with music within ~30–60s. Once it looks right, the nightly default is
`PRIVACY=public DURATION_MIN=60`.

---

## Schedule it nightly (11 PM – 12 AM IST)

IST 11 PM = **17:30 UTC**. Two options:

### Option A — always-on VM + cron (simplest)

```bash
( crontab -l 2>/dev/null; \
  echo '30 17 * * * /home/'"$USER"'/tez-terminal/streamer/run-nightly.sh >> /var/log/fnoninja-stream.log 2>&1' \
) | crontab -
```

The container runs ~60 min and exits; the VM idles the rest of the day.

### Option B — scheduled start/stop (cheaper, ~$0 when off)

Add an instance schedule and a startup script that runs the stream on boot:

```bash
# startup script: run the stream once the VM boots
gcloud compute instances add-metadata fnoninja-streamer --zone=asia-south1-a \
  --metadata=startup-script='#! /bin/bash
cd /home/YOUR_USER/tez-terminal/streamer && ./run-nightly.sh >> /var/log/fnoninja-stream.log 2>&1'

# resource policy: start 17:25 UTC, stop 18:40 UTC daily
gcloud compute resource-policies create instance-schedule fnoninja-nightly \
  --region=asia-south1 \
  --vm-start-schedule='25 17 * * *' \
  --vm-stop-schedule='40 18 * * *' \
  --timezone=UTC

gcloud compute instances add-resource-policies fnoninja-streamer \
  --zone=asia-south1-a --resource-policies=fnoninja-nightly
```

> Option B only pays for ~75 min/day of VM time. The startup script kicks off the
> stream on boot; the stop schedule powers the VM down after.

## Updating the page/streamer

The streamer captures the **live** page, so broadcast UI changes deploy via the
normal app push — no rebuild needed. Rebuild the image only when changing
streamer code or the bundled music:

```bash
cd tez-terminal && git pull && docker build -f streamer/Dockerfile -t fnoninja-streamer .
```
