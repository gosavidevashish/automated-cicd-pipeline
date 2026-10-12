#!/usr/bin/env bash
#
# Starts the freshly built image on a throwaway port and checks it answers.
# Catches images that build fine but fail to start, before anything is deployed.
#
# Usage: scripts/smoke-test.sh <image> <expected-build-number>
set -Eeuo pipefail

IMAGE="${1:?usage: smoke-test.sh <image> <expected-build-number>}"
EXPECTED_BUILD="${2:?usage: smoke-test.sh <image> <expected-build-number>}"
PORT="${SMOKE_PORT:-18080}"
NAME="smoke-test-$$"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting $IMAGE on port $PORT"
docker run -d --name "$NAME" -p "${PORT}:3000" "$IMAGE" >/dev/null

for attempt in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "Health endpoint answered on attempt $attempt"
    info="$(curl -fsS "http://127.0.0.1:${PORT}/api/info")"
    echo "$info"
    if ! echo "$info" | grep -q "\"buildNumber\":\"${EXPECTED_BUILD}\""; then
      echo "ERROR: image reports a different build number than ${EXPECTED_BUILD}" >&2
      exit 1
    fi
    echo "Smoke test passed"
    exit 0
  fi
  sleep 1
done

echo "ERROR: container did not answer /health within 20 seconds" >&2
docker logs --tail 30 "$NAME" >&2 || true
exit 1
