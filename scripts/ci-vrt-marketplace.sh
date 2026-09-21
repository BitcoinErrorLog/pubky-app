#!/usr/bin/env bash
# Marketplace VRT for GitHub Actions (Linux).
#
# Compares against committed *-linux.png baselines. Missing linux baselines
# are recorded and uploaded as an artifact; they do not fail the job.
# Pixel mismatch against an existing linux baseline fails the job.
# *-darwin.png files are never written or updated.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export VRT_BROWSERS="${VRT_BROWSERS:-chromium,firefox}"
REPORT_DIR="${VRT_REPORT_DIR:-${ROOT}/.vrt-marketplace-ci}"
REPORT_JSON="${REPORT_DIR}/report.json"
NEW_LINUX_DIR="${REPORT_DIR}/new-linux-baselines"
mkdir -p "$REPORT_DIR" "$NEW_LINUX_DIR"

git checkout -- 'src/test/vrt/**/*-darwin.png' 2>/dev/null || true

run_vrt() {
  local extra=()
  if [ "${1:-}" = "update" ]; then
    extra+=(--update)
  fi
  npx vitest run --project vrt-marketplace \
    --reporter=dot \
    --reporter=json \
    --outputFile="$REPORT_JSON" \
    "${extra[@]}"
}

classify() {
  node --input-type=module - "$REPORT_JSON" <<'NODE'
import { readFileSync } from 'node:fs';

const path = process.argv[2];
let report;
try {
  report = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`could not parse ${path}: ${error.message}`);
  process.exit(12);
}

const messages = [];
function walk(value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'failureMessages' && Array.isArray(nested)) {
      for (const message of nested) {
        if (typeof message === 'string') messages.push(message);
      }
    } else if (key === 'errors' && Array.isArray(nested)) {
      for (const error of nested) {
        if (typeof error === 'string') messages.push(error);
        else if (error && typeof error.message === 'string') messages.push(error.message);
        else if (error && typeof error.stack === 'string') messages.push(error.stack);
      }
    } else if (typeof nested === 'string' && /screenshot|reference|mismatch/i.test(nested)) {
      messages.push(nested);
    } else {
      walk(nested);
    }
  }
}
walk(report);

const missing = messages.filter((message) =>
  /No existing reference screenshot found/i.test(message),
);
const mismatch = messages.filter((message) =>
  /mismatch|to match screenshot|screenshots do not match|Expected screenshot/i.test(message) &&
  !/No existing reference screenshot found/i.test(message),
);
const other = messages.filter(
  (message) =>
    !/No existing reference screenshot found/i.test(message) &&
    !/mismatch|to match screenshot|screenshots do not match|Expected screenshot/i.test(message),
);

const failed =
  report.success === false ||
  (typeof report.numFailedTests === 'number' && report.numFailedTests > 0) ||
  (typeof report.numFailedTestSuites === 'number' && report.numFailedTestSuites > 0);

if (!failed) {
  console.log('CLASS=pass');
  process.exit(0);
}
if (mismatch.length > 0 || other.length > 0) {
  console.log(`CLASS=mismatch missing=${missing.length} mismatch=${mismatch.length} other=${other.length}`);
  process.exit(11);
}
if (missing.length > 0) {
  console.log(`CLASS=missing missing=${missing.length}`);
  process.exit(10);
}
console.log('CLASS=other');
process.exit(12);
NODE
}

echo "Running marketplace VRT (browsers=${VRT_BROWSERS})"
set +e
run_vrt compare
VRT_EXIT=$?
set -e

CLASS_OUT="$(classify)"
CLASS_EXIT=$?
echo "$CLASS_OUT"

restore_committed_pngs() {
  git checkout -- 'src/test/vrt/**/*-darwin.png' 2>/dev/null || true
  git diff --name-only -- 'src/test/vrt/**/*-linux.png' | while IFS= read -r file; do
    [ -n "$file" ] || continue
    git checkout -- "$file"
  done
}

stage_new_linux() {
  git ls-files --others --exclude-standard -- 'src/test/vrt/marketplace/**/*-linux.png' |
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      rel="${file#src/test/vrt/}"
      dest="${NEW_LINUX_DIR}/${rel}"
      mkdir -p "$(dirname "$dest")"
      cp "$file" "$dest"
    done
}

if [ "$CLASS_EXIT" -eq 0 ]; then
  echo "Marketplace VRT matched existing Linux baselines."
  exit 0
fi

if [ "$CLASS_EXIT" -eq 10 ]; then
  echo "Missing Linux baselines only. Recording them for the artifact (no darwin writes)."
  set +e
  run_vrt update
  set -e
  restore_committed_pngs
  stage_new_linux
  echo "New Linux baselines staged under ${NEW_LINUX_DIR}"
  find "$NEW_LINUX_DIR" -name '*-linux.png' | wc -l
  exit 0
fi

echo "Marketplace VRT failed on a real mismatch or non-missing error."
echo "Vitest exit=${VRT_EXIT} classify=${CLASS_EXIT}"
restore_committed_pngs
exit 1
