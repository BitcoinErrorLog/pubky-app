#!/usr/bin/env bash
# Local Linux marketplace VRT in the same Playwright image CI uses.
#
# --update is restricted to MISSING *-linux.png baselines only
# (see scripts/ci-vrt-marketplace.sh + VRT_LINUX_LOCAL=1). Tracked linux
# files are restored after a record pass. Darwin files are never written.
# Host darwin node_modules is overlaid so `npm ci` cannot replace the
# worktree symlink with a nested Linux install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${VRT_LINUX_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-noble}"
VOLUME="${VRT_LINUX_NM_VOLUME:-pubky-app-vrt-linux-nm}"

export COPYFILE_DISABLE=1

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for npm run vrt:linux" >&2
  exit 1
fi

docker run --rm \
  -e COPYFILE_DISABLE=1 \
  -e VRT_BROWSERS="${VRT_BROWSERS:-chromium,firefox}" \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e VRT_LINUX_LOCAL=1 \
  -e CI=true \
  -v "$ROOT":/w \
  -v "${VOLUME}:/w/node_modules" \
  -w /w \
  "$IMAGE" \
  bash -lc 'npm ci && bash scripts/ci-vrt-marketplace.sh'
