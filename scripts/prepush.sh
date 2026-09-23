#!/usr/bin/env bash
# Pre-push gate. Last line on success: PREPUSH OK <sha> <seconds>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

start=$(date +%s)
LOCK="/Volumes/t7/vibes-dev/.locks/heavy.lock"

run_heavy() {
  mkdir -p "$(dirname "$LOCK")"
  # lockf waits. Do not pass -t 0.
  lockf "$LOCK" "$@"
}

# Hook stdin lists the refs being pushed. A push whose every commit message
# contains [skip ci] does not run the gate. A manual tty run always does.
if [ ! -t 0 ]; then
  skip=1
  saw=0
  while read -r _local_ref local_sha _remote_ref remote_sha; do
    [ -n "${local_sha:-}" ] || continue
    saw=1
    if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
      continue
    fi
    if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
      range="$local_sha"
    else
      range="${remote_sha}..${local_sha}"
    fi
    if git log --format=%s "$range" | grep -qv '\[skip ci\]'; then
      skip=0
    fi
  done
  if [ "$saw" = 1 ] && [ "$skip" = 1 ]; then
    echo "prepush: every commit has [skip ci]; gate not run"
    exit 0
  fi
fi

if [ -n "${PREPUSH_BASE:-}" ]; then
  base="$PREPUSH_BASE"
elif git rev-parse --verify --quiet origin/release/shop-v0.6.8 >/dev/null; then
  base="$(git merge-base HEAD origin/release/shop-v0.6.8)"
else
  echo "prepush: set PREPUSH_BASE to the merge base" >&2
  exit 1
fi

changed=()
while IFS= read -r line; do
  [ -n "$line" ] && changed+=("$line")
done < <(git diff --name-only --diff-filter=ACMR "$base" HEAD)

prettier_files=()
eslint_files=()
unit_files=()
if [ "${#changed[@]}" -gt 0 ]; then
  for file in "${changed[@]}"; do
    [ -f "$file" ] || continue
    case "$file" in
      *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md) prettier_files+=("$file") ;;
    esac
    case "$file" in
      *.ts|*.tsx|*.js|*.jsx)
        eslint_files+=("$file")
        unit_files+=("$file")
        ;;
    esac
  done
fi

if [ "${#prettier_files[@]}" -gt 0 ]; then
  echo "prepush: prettier (${#prettier_files[@]} files)"
  npx prettier --check --ignore-path .prettierignore "${prettier_files[@]}"
fi

if [ "${#eslint_files[@]}" -gt 0 ]; then
  echo "prepush: eslint (${#eslint_files[@]} files)"
  npx eslint "${eslint_files[@]}"
fi

echo "prepush: typecheck"
run_heavy npm run typecheck

if [ "${#unit_files[@]}" -gt 0 ]; then
  echo "prepush: vitest related (${#unit_files[@]} files)"
  related_log="$(mktemp)"
  set +e
  run_heavy npx vitest related --run --project unit "${unit_files[@]}" >"$related_log" 2>&1
  related_status=$?
  set -e
  cat "$related_log"
  if [ "$related_status" -ne 0 ]; then
    if grep -q 'No test files found' "$related_log"; then
      echo "prepush: no related unit tests"
    else
      rm -f "$related_log"
      exit "$related_status"
    fi
  fi
  rm -f "$related_log"
fi

vrt_specs=()
if [ "${#changed[@]}" -gt 0 ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && vrt_specs+=("$line")
  done < <(node scripts/vrt-related.mjs "${changed[@]}")
fi

if [ "${#vrt_specs[@]}" -gt 0 ]; then
  echo "prepush: linux vrt (${#vrt_specs[@]} specs)"
  printf '  %s\n' "${vrt_specs[@]}"
  run_heavy bash scripts/vrt-linux.sh "${vrt_specs[@]}"
else
  echo "prepush: linux vrt (no specs render a changed file)"
fi

sha="$(git rev-parse HEAD)"
seconds="$(( $(date +%s) - start ))"
echo "PREPUSH OK ${sha} ${seconds}"
