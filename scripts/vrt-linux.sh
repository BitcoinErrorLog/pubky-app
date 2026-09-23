#!/usr/bin/env bash
# Linux VRT in the pinned Playwright image CI uses.
# Usage: scripts/vrt-linux.sh [spec...]
# No arguments runs the full Linux suite. Missing *-linux.png baselines fail.
# This script does not read or write *-darwin.png.
#
# vrt-marketplace and vrt each run in their own container. One container
# running both leaves the second project with a closed browser: the first
# Vitest process hangs on close, and the next process in that container
# loses the browser before any test runs.
#
# Each container also needs a large /dev/shm. Docker's default is 64MB.
# The vrt project starts Chromium and Firefox for every spec at once, and
# Chromium's font service aborts with ENOSPC ("No space left on device")
# while those pages are opening. Vitest then reports a closed browser
# before any test runs. Fonts are installed; the cache has nowhere to go.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${VRT_LINUX_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-noble}"
VOLUME="${VRT_LINUX_NM_VOLUME:-pubky-app-vrt-linux-nm}"

export COPYFILE_DISABLE=1

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for scripts/vrt-linux.sh" >&2
  exit 1
fi

# A host node_modules symlink is followed by the bind mount. npm ci then
# deletes that symlink and writes a real directory into the worktree.
# Replace it with an empty mountpoint for the volume, and restore the link.
NM_LINK=""
if [ -L "$ROOT/node_modules" ]; then
  NM_LINK="$(readlink "$ROOT/node_modules")"
  rm "$ROOT/node_modules"
  mkdir "$ROOT/node_modules"
fi
restore_nm() {
  rm -rf "$ROOT/.vitest-attachments"
  if [ -n "$NM_LINK" ]; then
    rm -rf "$ROOT/node_modules"
    ln -s "$NM_LINK" "$ROOT/node_modules"
  fi
}
trap restore_nm EXIT

quote_list() {
  local out="" spec
  for spec in "$@"; do
    out+=" $(printf '%q' "$spec")"
  done
  printf '%s' "$out"
}

installed=0
run_project() {
  local project="$1"
  shift
  local cmd=""
  if [ "$installed" -eq 0 ]; then
    cmd="npm ci && "
    installed=1
  fi
  cmd+="npx vitest run --project ${project}"
  if [ "$#" -gt 0 ]; then
    cmd+="$(quote_list "$@")"
  fi
  echo "vrt-linux: container ${project}"
  docker run --rm \
    --shm-size="${VRT_LINUX_SHM_SIZE:-2g}" \
    -e COPYFILE_DISABLE=1 \
    -e VRT_BROWSERS="${VRT_BROWSERS:-chromium,firefox}" \
    -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    -e CI=true \
    -v "$ROOT":/w \
    -v "${VOLUME}:/w/node_modules" \
    -w /w \
    "$IMAGE" \
    bash -lc "$cmd"
}

if [ "$#" -eq 0 ]; then
  run_project vrt-marketplace
  run_project vrt
else
  market=()
  other=()
  for spec in "$@"; do
    case "$spec" in
      src/test/vrt/marketplace/*) market+=("$spec") ;;
      *) other+=("$spec") ;;
    esac
  done
  if [ "${#market[@]}" -gt 0 ]; then
    run_project vrt-marketplace "${market[@]}"
  fi
  if [ "${#other[@]}" -gt 0 ]; then
    run_project vrt "${other[@]}"
  fi
fi
