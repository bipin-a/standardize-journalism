#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import requests

from config_loader import get_gcs_path, load_config


def require_cmd(command):
    if shutil.which(command) is None:
        raise SystemExit(f"Missing required command: {command}")


def run_cmd(command, check=True):
    return subprocess.run(command, check=check)


def ckan_call(base_url, endpoint, timeout):
    url = f"{base_url}/api/3/action/{endpoint}"
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("error", {}).get("message", "CKAN call failed"))
    return payload["result"]


def parse_year(value):
    if value is None:
        return None
    text = str(value).strip()
    if len(text) < 4 or not text[:4].isdigit():
        return None
    year = int(text[:4])
    if year < 1900 or year > 2100:
        return None
    return year


def load_year_range(json_path, label):
    if not json_path.exists():
        raise RuntimeError(f"{label} file not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list) or not data:
        raise RuntimeError(f"{label} data is empty")

    years = sorted({int(row["fiscal_year"]) for row in data if "fiscal_year" in row})
    if not years:
        raise RuntimeError(f"No fiscal years found in {label} data")

    return years[0], years[-1]


def load_year_range_from_keys(json_path, label, keys):
    if not json_path.exists():
        raise RuntimeError(f"{label} file not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list) or not data:
        raise RuntimeError(f"{label} data is empty")

    years = set()
    for record in data:
        for key in keys:
            year = parse_year(record.get(key))
            if year:
                years.add(year)
                break

    if not years:
        raise RuntimeError(f"No valid years found in {label} data")

    years = sorted(years)
    return years[0], years[-1]


def download_ward_geojson(base_url, resource_id, output_path, timeout, download_timeout):
    resource_meta = ckan_call(base_url, f"resource_show?id={resource_id}", timeout)
    download_url = resource_meta.get("url")
    if not download_url:
        raise RuntimeError("Ward GeoJSON resource has no download URL")

    response = requests.get(download_url, timeout=download_timeout)
    response.raise_for_status()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.content)


def main():
    require_cmd("gcloud")

    create_bucket = os.environ.get("CREATE_BUCKET", "0") == "1"
    make_public = os.environ.get("MAKE_PUBLIC", "0") == "1"

    config = load_config()
    gcp = config.get("gcp", {})
    storage = config.get("storage", {})
    datasets = config.get("datasets", {})

    project_id = gcp.get("project_id")
    bucket_name = gcp.get("bucket_name")
    region = gcp.get("region")
    cache_control = gcp.get("cache_control")
    ckan_base_url = config.get("ckan", {}).get("base_url")
    ckan_timeout = config.get("ckan", {}).get("timeout", 30)
    ckan_download_timeout = config.get("ckan", {}).get("download_timeout", 60)

    if not project_id or not bucket_name or not ckan_base_url:
        raise SystemExit("Missing GCP project_id, bucket_name, or CKAN base_url in config.yaml")

    capital_config = datasets.get("capital_by_ward", {})
    financial_config = datasets.get("financial_return", {})
    council_config = datasets.get("council_voting", {})
    lobbyist_config = datasets.get("lobbyist_registry", {})
    ward_geojson_config = datasets.get("ward_geojson", {})

    capital_csv_name = capital_config.get("output_filename")
    capital_json_name = capital_config.get("json_output_filename")
    financial_name = financial_config.get("output_filename")
    council_name = council_config.get("output_filename")
    lobbyist_name = lobbyist_config.get("output_filename")
    ward_geojson_name = ward_geojson_config.get("output_filename")
    ward_geojson_resource_id = ward_geojson_config.get("resource_id")

    if not capital_csv_name or not capital_json_name or not financial_name:
        raise SystemExit("Missing output filenames in config.yaml for capital_by_ward or financial_return")
    if not council_name or not lobbyist_name or not ward_geojson_name:
        raise SystemExit("Missing output filenames in config.yaml for council_voting, lobbyist_registry, or ward_geojson")
    if not ward_geojson_resource_id:
        raise SystemExit("Missing ward_geojson.resource_id in config.yaml")

    raw_dir = Path(storage.get("raw_dir", "data/raw"))
    processed_dir = Path(storage.get("processed_dir", "data/processed"))
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    capital_csv_path = processed_dir / capital_csv_name
    capital_json_path = processed_dir / capital_json_name
    financial_path = processed_dir / financial_name
    council_path = processed_dir / council_name
    lobbyist_path = processed_dir / lobbyist_name
    ward_geojson_path = processed_dir / ward_geojson_name

    print("Running ETL...")
    run_cmd([sys.executable, "etl/capital_by_ward_etl.py", "--output", str(capital_csv_path), "--json-output", str(capital_json_path)])
    run_cmd([sys.executable, "etl/financial_return_etl.py", "--output", str(financial_path), "--raw-dir", str(raw_dir)])
    run_cmd([sys.executable, "etl/council_voting_etl.py", "--output", str(council_path), "--raw-dir", str(raw_dir)])
    run_cmd([sys.executable, "etl/lobbyist_registry_etl.py", "--output", str(lobbyist_path), "--raw-dir", str(raw_dir)])

    print("Fetching ward boundaries GeoJSON...")
    download_ward_geojson(
        ckan_base_url,
        ward_geojson_resource_id,
        ward_geojson_path,
        ckan_timeout,
        ckan_download_timeout
    )

    print("Extracting metadata from ETL outputs...")
    capital_start, capital_end = load_year_range(capital_json_path, "Capital budget")
    financial_start, financial_end = load_year_range(financial_path, "Financial return")
    council_start, council_end = load_year_range_from_keys(council_path, "Council voting", ["meeting_date"])
    lobbyist_start, lobbyist_end = load_year_range_from_keys(
        lobbyist_path,
        "Lobbyist registry",
        ["communication_date", "registration_date"]
    )

    capital_dest = get_gcs_path("capital_by_ward", {"year_start": capital_start, "year_end": capital_end})
    money_flow_dest = get_gcs_path("financial_return", {"year_start": financial_start, "year_end": financial_end})
    council_dest = get_gcs_path("council_voting", {"year_start": council_start, "year_end": council_end})
    lobbyist_dest = get_gcs_path("lobbyist_registry", {"year_start": lobbyist_start, "year_end": lobbyist_end})
    ward_geojson_dest = get_gcs_path("ward_geojson", {})

    print("GCS paths:")
    print(f"  Capital: {capital_dest}")
    print(f"  Money Flow: {money_flow_dest}")
    print(f"  Council Voting: {council_dest}")
    print(f"  Lobbyist Registry: {lobbyist_dest}")
    print(f"  Ward GeoJSON: {ward_geojson_dest}")

    if not capital_dest or not money_flow_dest or not council_dest or not lobbyist_dest or not ward_geojson_dest:
        raise SystemExit("Failed to generate GCS destination paths")

    if create_bucket:
        result = subprocess.run(
            ["gcloud", "--project", project_id, "storage", "buckets", "describe", f"gs://{bucket_name}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode != 0:
            run_cmd([
                "gcloud",
                "--project",
                project_id,
                "storage",
                "buckets",
                "create",
                f"gs://{bucket_name}",
                "--location",
                region,
                "--uniform-bucket-level-access",
            ])

    print("Uploading JSON to GCS...")
    money_flow_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(financial_path), money_flow_dest]
    capital_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(capital_json_path), capital_dest]
    council_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(council_path), council_dest]
    lobbyist_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(lobbyist_path), lobbyist_dest]
    ward_geojson_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(ward_geojson_path), ward_geojson_dest]

    if cache_control:
        money_flow_cmd.extend(["--cache-control", cache_control])
        capital_cmd.extend(["--cache-control", cache_control])
        council_cmd.extend(["--cache-control", cache_control])
        lobbyist_cmd.extend(["--cache-control", cache_control])
        ward_geojson_cmd.extend(["--cache-control", cache_control])

    run_cmd(money_flow_cmd)
    run_cmd(capital_cmd)
    run_cmd(council_cmd)
    run_cmd(lobbyist_cmd)
    run_cmd(ward_geojson_cmd)

    if make_public:
        run_cmd([
            "gcloud",
            "--project",
            project_id,
            "storage",
            "buckets",
            "add-iam-policy-binding",
            f"gs://{bucket_name}",
            "--member=allUsers",
            "--role=roles/storage.objectViewer",
        ])

    print("Done.")


if __name__ == "__main__":
    main()
