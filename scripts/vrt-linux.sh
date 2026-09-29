#!/usr/bin/env bash
# Linux VRT in the pinned Playwright image CI uses.
# Usage: scripts/vrt-linux.sh [spec...]
# No arguments runs the full Linux suite. Missing *-linux.png baselines fail.
# VRT_LINUX_UPDATE=1 writes *-linux.png baselines (vitest --update). --update
# rewrites every scene in the named files, so follow it with
# scripts/vrt-revert-outside.sh <spec>... to drop PNGs outside the named set.
# This script does not read or write *-darwin.png.
#
# vrt-marketplace and vrt each run in their own container. One container
# running both leaves the second project with a closed browser: the first
# Vitest process hangs on close, and the next process in that container
# loses the browser before any test runs.
#
# Docker's default /dev/shm is 64MB. Firefox uses it, and a plain Chromium
# (not Playwright's headless shell) aborts in the font service with ENOSPC
# once enough desktop pages are open. Playwright's Chromium is launched
# with --disable-dev-shm-usage, so this size is not what closes the Vitest
# socket. The vrt project also runs one file at a time for that.
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

# One Docker VRT at a time. The slot is held for this whole script, including
# a direct invocation. Re-exec so the lock outlives the shell functions here.
if [ "${VRT_LOCK_HELD:-}" != 1 ]; then
  # shellcheck source=heavy-lock.sh
  source "$ROOT/scripts/heavy-lock.sh"
  export VRT_LOCK_HELD=1
  run_heavy vrt bash "$ROOT/scripts/vrt-linux.sh" "$@"
  exit 0
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
  # Preserve a failing test status. Bash uses the EXIT trap's status as the
  # script status, so a successful restore must not turn a red suite green.
  local status=$?
  local attempt
  rm -rf "$ROOT/.vitest-attachments" || true
  if [ -z "$NM_LINK" ]; then
    return "$status"
  fi
  # Docker Desktop releases the nested volume mount after the container
  # exits. rm of that mountpoint returns "Permission denied" until the
  # share is gone, and a single attempt then fails the gate after the
  # tests have already passed.
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if [ ! -e "$ROOT/node_modules" ] && [ ! -L "$ROOT/node_modules" ]; then
      break
    fi
    rm -rf "$ROOT/node_modules" 2>/dev/null || true
    if [ -d "$ROOT/node_modules" ] && [ ! -L "$ROOT/node_modules" ]; then
      rmdir "$ROOT/node_modules" 2>/dev/null || true
    fi
    if [ -e "$ROOT/node_modules" ] || [ -L "$ROOT/node_modules" ]; then
      sleep 1
    fi
  done
  if [ -e "$ROOT/node_modules" ] || [ -L "$ROOT/node_modules" ]; then
    echo "vrt-linux: could not remove the node_modules mountpoint" >&2
    return 1
  fi
  ln -s "$NM_LINK" "$ROOT/node_modules"
  return "$status"
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
  if [ "${VRT_LINUX_UPDATE:-}" = 1 ]; then
    cmd+=" --update"
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
