#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${NANO_BANANA_APP_DIR:-/home/vasily/apps/nano-banana-ui}"
REMOTE="${NANO_BANANA_REMOTE:-origin}"
BRANCH="${NANO_BANANA_BRANCH:-main}"
PM2_APP="${NANO_BANANA_PM2_APP:-nano-banana-ui}"
HEALTH_URL="${NANO_BANANA_HEALTH_URL:-http://127.0.0.1:3020/}"
LOCK_FILE="${NANO_BANANA_LOCK_FILE:-/tmp/nano-banana-ui-deploy.lock}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

trap 'log "Deployment failed at line ${LINENO}."' ERR

cd "$APP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'Another deployment is already running; skipping.'
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  log 'Refusing to deploy over a dirty production worktree.'
  exit 1
fi

log "Checking ${REMOTE}/${BRANCH} for updates."
git fetch --prune "$REMOTE"

current_revision="$(git rev-parse HEAD)"
target_revision="$(git rev-parse "${REMOTE}/${BRANCH}")"

if [ "$current_revision" = "$target_revision" ]; then
  log "Already deployed at ${current_revision:0:7}."
  exit 0
fi

if ! git merge-base --is-ancestor "$current_revision" "$target_revision"; then
  log "Refusing non-fast-forward deployment from ${current_revision:0:7} to ${target_revision:0:7}."
  exit 1
fi

log "Deploying ${current_revision:0:7} -> ${target_revision:0:7}."
git merge --ff-only "$target_revision"
pnpm install --frozen-lockfile
pnpm build
pm2 restart "$PM2_APP" --update-env

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --output /dev/null "$HEALTH_URL"; then
    log "Deployment ${target_revision:0:7} is healthy."
    exit 0
  fi
  log "Health check ${attempt}/30 failed; retrying in 2 seconds."
  sleep 2
done

log "Deployment ${target_revision:0:7} did not become healthy at ${HEALTH_URL}."
exit 1
