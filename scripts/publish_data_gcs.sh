#!/usr/bin/env bash
set -euo pipefail

if ! command -v uv >/dev/null 2>&1; then
  echo "Missing required command: uv" >&2
  exit 1
fi

uv run --with-requirements etl/requirements.txt -- python etl/publish_data_gcs.py
