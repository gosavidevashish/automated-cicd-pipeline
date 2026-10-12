#!/usr/bin/env bash
#
# Confirms the live service is running the build we just deployed.
# Run after deploy.sh; it talks to the real public port, not a test one.
#
# Usage: scripts/verify.sh <base-url> <expected-build-number>
set -Eeuo pipefail

URL="${1:?usage: verify.sh <base-url> <expected-build-number>}"
EXPECTED_BUILD="${2:?usage: verify.sh <base-url> <expected-build-number>}"

for attempt in $(seq 1 15); do
  if info="$(curl -fsS --max-time 3 "${URL}/api/info" 2>/dev/null)"; then
    if echo "$info" | grep -q "\"buildNumber\":\"${EXPECTED_BUILD}\""; then
      echo "Verified: ${URL} is serving build #${EXPECTED_BUILD}"
      exit 0
    fi
    echo "Attempt $attempt: service is up but reports a different build"
  else
    echo "Attempt $attempt: ${URL} not reachable yet"
  fi
  sleep 2
done

echo "ERROR: ${URL} is not serving build #${EXPECTED_BUILD}" >&2
exit 1
