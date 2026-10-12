#!/usr/bin/env bash
#
# One-screen view of the deployed service: state, health, resources,
# recent logs and recent deployments. Run on the server.
set -uo pipefail

APP_NAME="${APP_NAME:-release-console}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/release-console}"

echo "== Container"
docker ps -a --filter "name=^${APP_NAME}$" \
  --format 'name: {{.Names}}\nimage: {{.Image}}\nstatus: {{.Status}}\nports: {{.Ports}}'

echo
echo "== Health"
docker inspect -f '{{if .State.Health}}{{.State.Health.Status}} (failing streak: {{.State.Health.FailingStreak}}){{else}}no health check{{end}}' "$APP_NAME" 2>/dev/null || echo "container not found"

echo
echo "== Resources"
docker stats --no-stream --format 'cpu: {{.CPUPerc}}   memory: {{.MemUsage}}' "$APP_NAME" 2>/dev/null || echo "not running"

echo
echo "== Last 10 log lines"
docker logs --tail 10 "$APP_NAME" 2>&1 || true

echo
echo "== Last 5 deployments"
if [ -f "$DEPLOY_DIR/deployments.log" ]; then
  tail -n 5 "$DEPLOY_DIR/deployments.log"
else
  echo "no deployments recorded"
fi
