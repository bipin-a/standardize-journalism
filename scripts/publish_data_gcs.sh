#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-standardize-journalism}"
BUCKET_NAME="${BUCKET_NAME:-standardize-journalism-data}"
REGION="${REGION:-us-central1}"
CACHE_CONTROL="${CACHE_CONTROL:-public, max-age=3600}"
CREATE_BUCKET="${CREATE_BUCKET:-0}"
MAKE_PUBLIC="${MAKE_PUBLIC:-0}"

RAW_DIR="data/raw"
PROCESSED_DIR="data/processed"
LOCAL_CAPITAL="${PROCESSED_DIR}/capital_by_ward.json"
LOCAL_MONEY_FLOW="${PROCESSED_DIR}/financial_return.json"

CAPITAL_DEST="gs://${BUCKET_NAME}/capital/2020-2029/capital_by_ward.json"
MONEY_FLOW_DEST="gs://${BUCKET_NAME}/money-flow/2024/financial_return.json"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd uv
require_cmd gcloud

uv run python - <<'PY'
missing = []
for name in ("pandas", "openpyxl", "requests"):
    try:
        __import__(name)
    except Exception:
        missing.append(name)
if missing:
    raise SystemExit(
        "Missing Python packages: " + ", ".join(missing)
        + "\\nInstall with: uv pip install -r etl/requirements.txt"
    )
PY

mkdir -p "${RAW_DIR}" "${PROCESSED_DIR}"

echo "Running ETL..."
uv run python etl/capital_by_ward_etl.py --json-output "${LOCAL_CAPITAL}"
uv run python etl/financial_return_etl.py --output "${LOCAL_MONEY_FLOW}" --raw-dir "${RAW_DIR}"

if [[ "${CREATE_BUCKET}" == "1" ]]; then
  if gcloud --project="${PROJECT_ID}" storage buckets describe "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
    echo "Bucket already exists: gs://${BUCKET_NAME}"
  else
    echo "Creating bucket: gs://${BUCKET_NAME}"
    gcloud --project="${PROJECT_ID}" storage buckets create "gs://${BUCKET_NAME}" \
      --location="${REGION}" --uniform-bucket-level-access
  fi
fi

echo "Uploading JSON to GCS..."
gcloud --project="${PROJECT_ID}" storage cp "${LOCAL_MONEY_FLOW}" "${MONEY_FLOW_DEST}" \
  --cache-control="${CACHE_CONTROL}"
gcloud --project="${PROJECT_ID}" storage cp "${LOCAL_CAPITAL}" "${CAPITAL_DEST}" \
  --cache-control="${CACHE_CONTROL}"

if [[ "${MAKE_PUBLIC}" == "1" ]]; then
  echo "Making bucket public: gs://${BUCKET_NAME}"
  gcloud --project="${PROJECT_ID}" storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
    --member=allUsers --role=roles/storage.objectViewer
fi

echo "Done."
