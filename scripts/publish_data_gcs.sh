#!/usr/bin/env bash
set -euo pipefail

if ! command -v uv >/dev/null 2>&1; then
  echo "Missing required command: uv" >&2
  exit 1
fi

usage() {
  cat <<'EOF'
Usage: ./scripts/publish_data_gcs.sh [ingest|gold|all]

Modes:
  ingest  Run ETL to produce processed data and upload to GCS
  gold    Build gold summaries from processed data and upload to GCS
  all     End-to-end (ingest + gold + uploads) [default]

Env:
  CREATE_BUCKET=1  Create bucket if missing
  MAKE_PUBLIC=1    Grant public read access
EOF
}

MODE="${1:-all}"
case "$MODE" in
  ingest|gold|all) ;;
  -h|--help|help) usage; exit 0 ;;
  *) echo "Unknown mode: $MODE" >&2; usage; exit 1 ;;
esac

uv run --with-requirements etl/requirements.txt -- python etl/publish_data_gcs.py "$MODE"
