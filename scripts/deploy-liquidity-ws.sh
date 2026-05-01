#!/bin/bash
# ── Deploy Liquidity WS Server to Cloud Run ───────────────────────────────────
#
# Prerequisites:
#   1. gcloud CLI installed → https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login && gcloud auth configure-docker asia-southeast1-docker.pkg.dev
#   3. gcloud config set project studio-6235588950-a15f2
#
# Run:  bash scripts/deploy-liquidity-ws.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_ID="studio-6235588950-a15f2"
REGION="asia-southeast1"
SERVICE_NAME="liquidity-ws"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME"

echo "▶ Building and pushing image..."
gcloud builds submit \
  --project "$PROJECT_ID" \
  --tag "$IMAGE" \
  --dockerfile Dockerfile.liquidity-ws \
  .

echo "▶ Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --min-instances 1 \
  --max-instances 1 \
  --memory 256Mi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 1 \
  --no-allow-unauthenticated \
  --update-env-vars "NODE_ENV=production,LIQUIDITY_SWEEP_MIN_SIGMA=2.5,LIQUIDITY_SWEEP_MIN_USD=50000"

echo "✓ Deployed. Service URL:"
gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format "value(status.url)"
