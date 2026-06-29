#!/usr/bin/env bash
#
# Deploy the FNONINJA video renderer as a Cloud Run Job + wire IAM so the
# App Hosting backend can trigger it. Run from the repo root:
#
#   ./scripts/deploy-video-renderer.sh
#
# Re-run any time the video/ code or Dockerfile changes — it rebuilds + updates
# the job in place. Requires: gcloud (authenticated), and the Cloud Run / Cloud
# Build / Artifact Registry APIs enabled on the project.
set -euo pipefail

PROJECT="${VIDEO_RENDER_PROJECT:-studio-6235588950-a15f2}"
REGION="${VIDEO_RENDER_REGION:-us-central1}"
JOB="${VIDEO_RENDER_JOB:-fnoninja-video-renderer}"
# App Hosting's compute service account doubles as the job runtime SA so it
# already has Firestore + Storage access; it's also the caller (the web app).
SA="${VIDEO_RENDER_SA:-firebase-app-hosting-compute@${PROJECT}.iam.gserviceaccount.com}"
BUCKET="${RENDER_VIDEO_BUCKET:-${PROJECT}.firebasestorage.app}"

echo "▶ Project=$PROJECT  Region=$REGION  Job=$JOB"
echo "▶ Runtime/caller SA=$SA  Bucket=$BUCKET"

echo "▶ Enabling required APIs (idempotent)…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project "$PROJECT"

echo "▶ Building image from video/ and deploying the Cloud Run Job…"
# --quiet auto-confirms prompts (e.g. creating the cloud-run-source-deploy
# Artifact Registry repo on first deploy) so this runs non-interactively.
gcloud run jobs deploy "$JOB" \
  --source video/ \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SA" \
  --memory 4Gi --cpu 2 \
  --task-timeout 1200s \
  --max-retries 1 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},RENDER_VIDEO_BUCKET=${BUCKET}" \
  --quiet

echo "▶ Granting the job runtime SA Firestore + Storage access (idempotent)…"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/datastore.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/storage.objectAdmin --condition=None >/dev/null

echo "▶ Letting the App Hosting backend trigger the job (run.developer + actAs)…"
# run.developer includes run.jobs.run + run.jobs.runWithOverrides (needed for the
# per-execution env overrides the trigger API sends).
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/run.developer --condition=None >/dev/null
# The caller must be able to actAs the job's runtime SA.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountUser >/dev/null

cat <<EOF

✅ Done. Cloud Run Job '$JOB' deployed in $REGION.

Next: make sure apphosting.yaml exposes these to the web app (already added):
  VIDEO_RENDER_JOB=$JOB
  VIDEO_RENDER_REGION=$REGION
Then push to main (App Hosting rollout) and use 'Generate video' on
https://tezterminal.com/admin/videos — it will trigger this job and poll for the MP4.

Smoke-test the job directly:
  gcloud run jobs execute $JOB --region $REGION --project $PROJECT \\
    --update-env-vars RENDER_ID=manual-test,TOPIC_ID=put-wall,COMPOSITION_ID=ClusterPut,PROPS_FILE=out/put.json,OUTPUT_FILE=out/put-cluster.mp4,BASE_URL=https://fnoninja.com,SOURCE=videos
EOF
