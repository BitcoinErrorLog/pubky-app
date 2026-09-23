#!/usr/bin/env bash
# Linux VRT in the pinned Playwright image CI uses.
# Usage: scripts/vrt-linux.sh <spec> [spec...]
# Missing baselines fail. VRT_LINUX_LOCAL is not set: that mode exits 0
# when a baseline is missing.
# No arguments: nothing to run (the pre-push gate only calls this with specs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$#" -eq 0 ]; then
  echo "vrt-linux: no spec files"
  exit 0
fi

IMAGE="${VRT_LINUX_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-noble}"
VOLUME="${VRT_LINUX_NM_VOLUME:-pubky-app-vrt-linux-nm}"

export COPYFILE_DISABLE=1

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for scripts/vrt-linux.sh" >&2
  exit 1
fi

market=()
other=()
for spec in "$@"; do
  case "$spec" in
    src/test/vrt/marketplace/*) market+=("$spec") ;;
    *) other+=("$spec") ;;
  esac
done

quote_list() {
  local out="" spec
  for spec in "$@"; do
    out+=" $(printf '%q' "$spec")"
  done
  printf '%s' "$out"
}

inner="npm ci"
if [ "${#market[@]}" -gt 0 ]; then
  inner+=" && npx vitest run --project vrt-marketplace$(quote_list "${market[@]}")"
fi
if [ "${#other[@]}" -gt 0 ]; then
  inner+=" && npx vitest run --project vrt$(quote_list "${other[@]}")"
fi

docker run --rm \
  -e COPYFILE_DISABLE=1 \
  -e VRT_BROWSERS="${VRT_BROWSERS:-chromium,firefox}" \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e CI=true \
  -v "$ROOT":/w \
  -v "${VOLUME}:/w/node_modules" \
  -w /w \
  "$IMAGE" \
  bash -lc "$inner"
