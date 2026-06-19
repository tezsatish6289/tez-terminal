#!/usr/bin/env bash
# Runs one nightly FNONINJA broadcast inside the Docker image, then exits.
# Reads OAuth secrets + config from /etc/fnoninja-streamer.env.
#
# Usage:
#   ./run-nightly.sh                 # full 60-min public stream
#   DURATION_MIN=2 ./run-nightly.sh  # short test
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/fnoninja-streamer.env}"
IMAGE="${IMAGE:-fnoninja-streamer}"

docker run --rm \
  --env-file "$ENV_FILE" \
  ${DURATION_MIN:+-e DURATION_MIN="$DURATION_MIN"} \
  ${PRIVACY:+-e PRIVACY="$PRIVACY"} \
  ${PROVISION_ONLY:+-e PROVISION_ONLY="$PROVISION_ONLY"} \
  --shm-size=1g \
  --name fnoninja-stream \
  "$IMAGE"
