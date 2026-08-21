#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE="${1:-smoke}"
MODE="${LOAD_MODE:-fake}"
ARTIFACT_DIR="${ROOT}/artifacts/load-tests"
RECORD_IDS_FILE="${ARTIFACT_DIR}/record-ids.txt"

if [[ "$MODE" != "fake" ]]; then
  echo "Refusing non-fake LOAD_MODE=$MODE (use fake for this script)" >&2
  exit 1
fi

if [[ -z "${LOAD_API_URL:-}" || -z "${LOAD_AUTH_TOKENS:-}" ]]; then
  echo "LOAD_API_URL and LOAD_AUTH_TOKENS are required" >&2
  exit 1
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required (https://k6.io/docs/get-started/installation/)" >&2
  exit 1
fi

mkdir -p "${ARTIFACT_DIR}"
: > "${RECORD_IDS_FILE}"

export LOAD_PROFILE="$PROFILE"
export LOAD_MODE=fake
export LOAD_RUN_ID="${LOAD_RUN_ID:-run_$(date +%s)}"
export LOAD_RECORD_IDS_FILE="${RECORD_IDS_FILE}"

echo "load start: profile=$PROFILE mode=fake runId=$LOAD_RUN_ID api=$LOAD_API_URL"
echo "auth tokens: configured"
echo "ops token: ${LOAD_OPS_TOKEN:+configured}"
echo "fake admin token: ${LOAD_FAKE_ADMIN_TOKEN:+configured}"

K6_LOG="${ARTIFACT_DIR}/k6-stdout.log"
set +e
k6 run "$ROOT/tests/load/music-generation-staging.js" | tee "${K6_LOG}"
K6_EXIT=${PIPESTATUS[0]}
set -e

# Collect record IDs from k6 stdout (RECORD_ID=...) — no secrets in those lines.
if [[ -f "${K6_LOG}" ]]; then
  sed -n 's/.*RECORD_ID=\([A-Za-z0-9_-][A-Za-z0-9_-]*\).*/\1/p' "${K6_LOG}" \
    | sort -u > "${RECORD_IDS_FILE}" || true
fi

# Post-run correctness (optional): ops summary + fake admin counters.
# Never print token values.
if [[ -n "${LOAD_OPS_TOKEN:-}" && -s "${RECORD_IDS_FILE}" ]]; then
  mapfile -t IDS < <(head -n 200 "${RECORD_IDS_FILE}")
  if [[ ${#IDS[@]} -gt 0 ]]; then
    BODY=$(node -e '
      const fs = require("node:fs");
      const ids = fs.readFileSync(0, "utf8").trim().split(/\n/).filter(Boolean).slice(0, 200);
      process.stdout.write(JSON.stringify({ recordIds: ids }));
    ' < "${RECORD_IDS_FILE}")
    HTTP_CODE=$(curl -sS -o "${ARTIFACT_DIR}/ops-summary.json" -w "%{http_code}" \
      -X POST "${LOAD_API_URL%/}/api/music/ops/load-test-summary" \
      -H "Content-Type: application/json" \
      -H "x-ops-token: ${LOAD_OPS_TOKEN}" \
      -d "${BODY}" || true)
    echo "ops summary http=${HTTP_CODE} ids=${#IDS[@]} (body in artifact, no PII expected)"
  fi
fi

if [[ -n "${LOAD_FAKE_ADMIN_URL:-}" && -n "${LOAD_FAKE_ADMIN_TOKEN:-}" ]]; then
  HTTP_CODE=$(curl -sS -o "${ARTIFACT_DIR}/fake-run-counters.json" -w "%{http_code}" \
    -H "x-fake-admin-token: ${LOAD_FAKE_ADMIN_TOKEN}" \
    "${LOAD_FAKE_ADMIN_URL%/}/admin/runs/${LOAD_RUN_ID}" || true)
  echo "fake admin counters http=${HTTP_CODE} (body in artifact)"
fi

exit "${K6_EXIT}"
