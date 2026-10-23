#!/usr/bin/env bash
#
# Deploys one image to the machine this script runs on.
#
#   - keeps the previous container as a backup until the new one is healthy
#   - waits for the Docker health check, not just for the process to start
#   - rolls back automatically if the new container never becomes healthy
#   - appends a JSON line to deployments.log, which the web app displays
#
# Required:  IMAGE        full image reference, e.g. release-console:12
# Optional:  APP_NAME, HOST_PORT, APP_ENV, DEPLOY_DIR, ENV_FILE,
#            BUILD_NUMBER, GIT_COMMIT, HEALTH_RETRIES
set -Eeuo pipefail

IMAGE="${IMAGE:?IMAGE is required, e.g. IMAGE=release-console:12}"
APP_NAME="${APP_NAME:-release-console}"
HOST_PORT="${HOST_PORT:-80}"
APP_ENV="${APP_ENV:-production}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/release-console}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/app.env}"
BUILD_NUMBER="${BUILD_NUMBER:-manual}"
GIT_COMMIT="${GIT_COMMIT:-unknown}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
BACKUP_NAME="${APP_NAME}-previous"
LOG_FILE="$DEPLOY_DIR/deployments.log"
STARTED_AT="$(date +%s)"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

record() {  # record <status>
  local status="$1" duration=$(( $(date +%s) - STARTED_AT ))
  printf '{"time":"%s","build":"%s","commit":"%s","image":"%s","environment":"%s","durationSeconds":%s,"status":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$BUILD_NUMBER" "$GIT_COMMIT" "$IMAGE" "$APP_ENV" "$duration" "$status" >> "$LOG_FILE"
}

command -v docker >/dev/null || die "docker is not installed on this host"
mkdir -p "$DEPLOY_DIR" 2>/dev/null || die "cannot create $DEPLOY_DIR; run scripts/setup-ubuntu.sh first"
touch "$LOG_FILE" 2>/dev/null || die "cannot write to $LOG_FILE; check that $DEPLOY_DIR is owned by this user"

log "Deploying $IMAGE as '$APP_NAME' on port $HOST_PORT ($APP_ENV)"

# 1. Make sure the image is on this machine (local builds already are).
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  log "Image not found locally, pulling"
  docker pull "$IMAGE" || die "could not pull $IMAGE"
fi

# 2. Move the running container aside instead of deleting it, so we can roll back.
HAD_PREVIOUS=false
docker rm -f "$BACKUP_NAME" >/dev/null 2>&1 || true
if docker container inspect "$APP_NAME" >/dev/null 2>&1; then
  log "Stopping current container and keeping it as '$BACKUP_NAME'"
  docker stop --time 10 "$APP_NAME" >/dev/null
  docker rename "$APP_NAME" "$BACKUP_NAME"
  HAD_PREVIOUS=true
else
  log "No existing container, this is a first deployment"
fi

# 3. Start the new container.
ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  log "Loading environment variables from $ENV_FILE"
  ENV_ARGS+=(--env-file "$ENV_FILE")
fi

docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:3000" \
  -e APP_ENV="$APP_ENV" \
  -e BUILD_NUMBER="$BUILD_NUMBER" \
  -e GIT_COMMIT="$GIT_COMMIT" \
  -e DEPLOYMENTS_FILE=/data/deployments.log \
  -v "$LOG_FILE:/data/deployments.log:ro,z" \
  --memory 256m \
  --log-driver json-file --log-opt max-size=5m --log-opt max-file=3 \
  "${ENV_ARGS[@]}" \
  "$IMAGE" >/dev/null

# 4. Wait for the container's own health check to pass.
log "Waiting for the container to report healthy"
healthy=false
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  state="$(docker container inspect -f '{{.State.Status}}' "$APP_NAME" 2>/dev/null || echo missing)"
  health="$(docker container inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$APP_NAME" 2>/dev/null || echo none)"
  if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
    healthy=true
    break
  fi
  if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
    break
  fi
  log "  attempt $attempt/$HEALTH_RETRIES: state=$state health=$health"
  sleep 2
done

# 5a. Success: drop the backup.
if [ "$healthy" = true ]; then
  docker rm -f "$BACKUP_NAME" >/dev/null 2>&1 || true
  record succeeded
  log "Deployment succeeded"
  exit 0
fi

# 5b. Failure: show why, then restore the previous version.
log "New container did not become healthy. Last log lines:"
docker logs --tail 20 "$APP_NAME" 2>&1 | sed 's/^/    /' || true
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true

if [ "$HAD_PREVIOUS" = true ]; then
  log "Rolling back to the previous container"
  docker rename "$BACKUP_NAME" "$APP_NAME"
  docker start "$APP_NAME" >/dev/null
  record rolled_back
  log "Rollback complete; the previous version is serving traffic"
else
  record failed
  log "No previous version to restore"
fi
exit 1
