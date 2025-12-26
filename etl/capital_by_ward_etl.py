#!/usr/bin/env python3
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

CKAN_BASE_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
DEFAULT_PACKAGE_ID = "budget-capital-budget-plan-by-ward-10-yr-approved"
DEFAULT_OUTPUT = "data/processed/capital_by_ward.csv"


def ckan_call(endpoint):
    url = f"{CKAN_BASE_URL}/{endpoint}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("error", {}).get("message", "CKAN call failed"))
    return payload["result"]


def parse_iso_datetime(value):
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def select_resource(resources, prefer_by_ward=True):
    candidates = [
        resource
        for resource in resources
        if str(resource.get("format", "")).lower() == "xlsx"
    ]
    if prefer_by_ward:
        by_ward = [
            resource
            for resource in candidates
            if "by-ward" in str(resource.get("name", "")).lower()
            or "by ward" in str(resource.get("name", "")).lower()
        ]
        if by_ward:
            candidates = by_ward

    if not candidates:
        raise RuntimeError("No XLSX resources found in the package.")

    candidates.sort(
        key=lambda resource: parse_iso_datetime(
            resource.get("last_modified") or resource.get("created")
        ),
        reverse=True,
    )
    return candidates[0]


def download_resource(resource, output_dir):
    url = resource.get("url")
    if not url:
        raise RuntimeError("Selected resource has no download URL.")
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = Path(url.split("?")[0]).name
    destination = output_dir / filename

    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)

    return destination


def normalize_column(name):
    return re.sub(r"\s+", " ", str(name)).strip().lower()


def detect_year_value(column):
    if isinstance(column, (int, float)) and int(column) == column:
        year = int(column)
        if 2000 <= year <= 2100:
            return year
    text = str(column).strip()
    if re.fullmatch(r"20\d{2}", text):
        return int(text)
    return None


def detect_sheet(excel_file):
    for sheet_name in excel_file.sheet_names:
        preview = pd.read_excel(excel_file, sheet_name=sheet_name, nrows=5)
        normalized = {normalize_column(col) for col in preview.columns}
        has_ward = "ward" in normalized or "ward name" in normalized
        has_ward_number = "ward number" in normalized or "ward no" in normalized
        has_year_offset = any(
            re.fullmatch(r"year\s*\d{1,2}", col) for col in normalized
        )
        has_year_actual = any(detect_year_value(col) for col in preview.columns)
        if has_ward and (has_year_offset or has_year_actual) and has_ward_number:
            return sheet_name
    return excel_file.sheet_names[0]


def extract_year_range(text):
    matches = re.findall(r"(20\d{2})", text)
    if len(matches) >= 2:
        return int(matches[0]), int(matches[1])
    return None, None


def build_column_map(columns):
    mapping = {}
    year_columns_by_year = {}
    year_columns_by_offset = {}

    for col in columns:
        year_value = detect_year_value(col)
        if year_value is not None:
            year_columns_by_year[year_value] = col
            continue

        normalized = normalize_column(col)
        if normalized in {"ward number", "ward no", "ward #"}:
            mapping["ward_number"] = col
        elif normalized in {"ward", "ward name"}:
            mapping["ward_name"] = col
        elif "program" in normalized and "name" in normalized:
            mapping["program_name"] = col
        elif normalized == "project name":
            mapping["project_name"] = col
        elif "sub" in normalized and "project" in normalized:
            mapping["sub_project_name"] = col
        elif normalized == "category":
            mapping["category"] = col
        elif re.fullmatch(r"year\s*\d{1,2}", normalized):
            year_index = int(re.sub(r"\D", "", normalized))
            if 1 <= year_index <= 10:
                year_columns_by_offset[year_index] = col
        elif normalized in {"total 10 year", "total 10 years"}:
            mapping["total_10_year"] = col

    return mapping, year_columns_by_year, year_columns_by_offset


def parse_number(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text or text.lower() in {"na", "n/a"}:
        return None

    is_negative = text.startswith("(") and text.endswith(")")
    if is_negative:
        text = text[1:-1]

    cleaned = text.replace("$", "").replace(",", "")
    try:
        number = float(cleaned)
    except ValueError:
        return None

    return -number if is_negative else number


def parse_ward_number(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def extract_rows(df, year_start, source_url, source_file):
    column_map, year_columns_by_year, year_columns_by_offset = build_column_map(
        df.columns
    )
    if "ward_number" not in column_map or "ward_name" not in column_map:
        raise RuntimeError("Ward columns not found in the worksheet.")
    if not year_columns_by_year and not year_columns_by_offset:
        raise RuntimeError(
            "Year columns not found (expected Year 1..10 or actual years like 2024)."
        )

    rows = []
    ingested_at = datetime.now(timezone.utc).isoformat()
    min_year = min(year_columns_by_year) if year_columns_by_year else None

    for _, record in df.iterrows():
        ward_number_raw = record.get(column_map["ward_number"])
        ward_name = record.get(column_map["ward_name"])

        # Handle City Wide projects specially
        is_city_wide = str(ward_number_raw).upper().strip() == "CW"
        if is_city_wide:
            ward_number = 0  # Use 0 for city-wide
        else:
            ward_number = parse_ward_number(ward_number_raw)

        if ward_number is None or ward_name is None or str(ward_name).strip() == "":
            continue

        # Extract project details if available
        program_name = record.get(column_map.get("program_name")) if "program_name" in column_map else None
        project_name = record.get(column_map.get("project_name")) if "project_name" in column_map else None
        category = record.get(column_map.get("category")) if "category" in column_map else None

        if year_columns_by_year:
            for fiscal_year in sorted(year_columns_by_year):
                column_name = year_columns_by_year[fiscal_year]
                amount_raw = parse_number(record.get(column_name))
                if amount_raw is None or amount_raw == 0:
                    continue

                amount = amount_raw * 1000
                year_offset = fiscal_year - min_year + 1 if min_year else None

                row_data = {
                    "fiscal_year": fiscal_year,
                    "ward_number": ward_number,
                    "ward_name": str(ward_name).strip(),
                    "amount": amount,
                    "year_offset": year_offset,
                    "source_file": source_file,
                    "source_url": source_url,
                    "ingested_at": ingested_at,
                }

                # Add project details if available
                if program_name:
                    row_data["program_name"] = str(program_name).strip()
                if project_name:
                    row_data["project_name"] = str(project_name).strip()
                if category:
                    row_data["category"] = str(category).strip()

                rows.append(row_data)
        else:
            if year_start is None:
                raise RuntimeError("Base year is required for Year 1..10 columns.")

            for year_index, column_name in sorted(year_columns_by_offset.items()):
                amount_raw = parse_number(record.get(column_name))
                if amount_raw is None or amount_raw == 0:
                    continue

                fiscal_year = year_start + (year_index - 1)
                amount = amount_raw * 1000

                row_data = {
                    "fiscal_year": fiscal_year,
                    "ward_number": ward_number,
                    "ward_name": str(ward_name).strip(),
                    "amount": amount,
                    "year_offset": year_index,
                    "source_file": source_file,
                    "source_url": source_url,
                    "ingested_at": ingested_at,
                }

                # Add project details if available
                if program_name:
                    row_data["program_name"] = str(program_name).strip()
                if project_name:
                    row_data["project_name"] = str(project_name).strip()
                if category:
                    row_data["category"] = str(category).strip()

                rows.append(row_data)

    return rows


def run_etl(args):
    package = ckan_call(f"package_show?id={args.package_id}")
    resources = package.get("resources", [])

    if args.resource_id:
        resource = next(
            (res for res in resources if res.get("id") == args.resource_id), None
        )
        if not resource:
            raise RuntimeError("Resource ID not found in the package.")
    else:
        resource = select_resource(resources, prefer_by_ward=not args.allow_details)

    output_dir = Path(args.output).parent
    raw_dir = Path(args.raw_dir)

    local_path = download_resource(resource, raw_dir)
    year_start = args.base_year
    if year_start is None:
        name_text = f"{resource.get('name', '')} {local_path.name}"
        year_start, _ = extract_year_range(name_text)

    if year_start is None:
        raise RuntimeError(
            "Base year could not be inferred. Provide --base-year explicitly."
        )

    excel_file = pd.ExcelFile(local_path)
    sheet_name = args.sheet_name or detect_sheet(excel_file)
    df = pd.read_excel(excel_file, sheet_name=sheet_name)

    rows = extract_rows(df, year_start, resource.get("url"), local_path.name)
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_frame = pd.DataFrame(rows)
    output_frame.to_csv(output_path, index=False)

    if args.json_output:
        json_path = Path(args.json_output)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=2)

    print(
        json.dumps(
            {
                "resource_id": resource.get("id"),
                "resource_name": resource.get("name"),
                "downloaded_file": str(local_path),
                "sheet_name": sheet_name,
                "rows_written": len(rows),
                "output_csv": str(output_path),
                "output_json": args.json_output,
                "year_start": year_start,
            },
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser(description="ETL for capital budget by ward.")
    parser.add_argument("--package-id", default=DEFAULT_PACKAGE_ID)
    parser.add_argument("--resource-id")
    parser.add_argument("--base-year", type=int)
    parser.add_argument("--sheet-name")
    parser.add_argument("--allow-details", action="store_true")
    parser.add_argument("--raw-dir", default="data/raw")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--json-output")

    args = parser.parse_args()
    run_etl(args)


if __name__ == "__main__":
    main()
