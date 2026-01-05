#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config_loader import get_dataset_config, load_config


def ckan_call(endpoint, base_url, timeout):
    url = f"{base_url}/api/3/action/{endpoint}"
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("error", {}).get("message", "CKAN call failed"))
    return payload["result"]


def parse_year(value):
    match = re.search(r"(20\d{2})", str(value))
    if match:
        return int(match.group(1))
    return None


def parse_number(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() in {"na", "n/a", "-", ""}:
        return None
    text = text.replace("$", "").replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def clean_text(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def select_resources(resources):
    candidates = []
    for resource in resources:
        name = str(resource.get("name", "")).lower()
        if str(resource.get("format", "")).lower() != "xlsx":
            continue
        if "operating-budget-summary" not in name:
            continue
        if "approved-operating-budget-summary" not in name:
            continue
        candidates.append(resource)

    if not candidates:
        raise RuntimeError("No approved operating budget summary resources found.")

    candidates.sort(
        key=lambda resource: parse_year(resource.get("name"))
        or parse_year(resource.get("url"))
        or 0
    )
    return candidates


def download_resource(resource, output_dir, timeout):
    url = resource.get("url")
    if not url:
        raise RuntimeError("Selected resource has no download URL.")
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = Path(url.split("?")[0]).name
    destination = output_dir / filename

    with requests.get(url, stream=True, timeout=timeout) as response:
        response.raise_for_status()
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)

    return destination


def detect_year_column(df, fiscal_year):
    for col in df.columns:
        if parse_year(col) == fiscal_year:
            return col
    for col in df.columns:
        if isinstance(col, (int, float)) and int(col) == fiscal_year:
            return col
    numeric_counts = {}
    for col in df.columns:
        count = 0
        for value in df[col].values:
            if parse_number(value) is not None:
                count += 1
        numeric_counts[col] = count
    if not numeric_counts:
        raise RuntimeError("Unable to detect a numeric amount column.")
    return max(numeric_counts, key=numeric_counts.get)


def score_sheet_columns(columns, fiscal_year):
    normalized = [str(col).strip().lower() for col in columns]
    score = 0
    wanted = {
        "program": 3,
        "service": 2,
        "activity": 2,
        "expense/revenue": 3,
        "category name": 2,
        "sub-category name": 1,
        "commitment item": 2,
    }
    for name, weight in wanted.items():
        if name in normalized:
            score += weight
    if any(parse_year(col) == fiscal_year for col in columns):
        score += 4
    return score


def load_sheet(path, fiscal_year):
    excel = pd.ExcelFile(path)
    best_sheet = None
    best_score = -1

    for sheet in excel.sheet_names:
        preview = excel.parse(sheet, nrows=5)
        if preview.shape[1] == 0:
            continue
        score = score_sheet_columns(preview.columns, fiscal_year)
        if score > best_score:
            best_score = score
            best_sheet = sheet

    if best_sheet is None:
        raise RuntimeError("No usable worksheet found in operating budget file.")

    return excel.parse(best_sheet)


def parse_resource(resource, path):
    fiscal_year = parse_year(resource.get("name")) or parse_year(resource.get("url"))
    if fiscal_year is None:
        raise RuntimeError(f"Could not determine fiscal year for resource {resource.get('name')}")

    df = load_sheet(path, fiscal_year)
    df = df.dropna(how="all")
    year_col = detect_year_column(df, fiscal_year)

    records = []
    ingested_at = datetime.now(timezone.utc).isoformat()
    for _, row in df.iterrows():
        amount = parse_number(row.get(year_col))
        if amount is None:
            continue
        record = {
            "fiscal_year": fiscal_year,
            "program": clean_text(row.get("Program")),
            "service": clean_text(row.get("Service")),
            "activity": clean_text(row.get("Activity")),
            "expense_revenue": clean_text(row.get("Expense/Revenue")),
            "category_name": clean_text(row.get("Category Name")),
            "sub_category_name": clean_text(row.get("Sub-Category Name")),
            "commitment_item": clean_text(row.get("Commitment item")),
            "amount": amount,
            "source_file": Path(path).name,
            "source_url": resource.get("url"),
            "ingested_at": ingested_at,
        }
        records.append(record)

    if not records:
        raise RuntimeError(f"No rows parsed for operating budget {fiscal_year}.")
    return records


def main():
    parser = argparse.ArgumentParser(description="ETL for operating budget summary.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    parser.add_argument("--raw-dir", default="data/raw", help="Raw download directory.")
    args = parser.parse_args()

    config = load_config()
    dataset = get_dataset_config("operating_budget")
    base_url = config.get("ckan", {}).get("base_url")
    timeout = config.get("ckan", {}).get("download_timeout", 60)

    if not base_url:
        raise SystemExit("Missing ckan.base_url in config.yaml")

    package_id = dataset.get("package_id")
    if not package_id:
        raise SystemExit("Missing operating_budget.package_id in config.yaml")

    package = ckan_call(f"package_show?id={package_id}", base_url, timeout)
    resources = select_resources(package.get("resources", []))

    raw_dir = Path(args.raw_dir)
    output_path = Path(args.output)
    all_records = []

    for resource in resources:
        path = download_resource(resource, raw_dir, timeout)
        all_records.extend(parse_resource(resource, path))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(all_records, handle, indent=2)

    print(f"✅ Wrote {len(all_records)} operating budget rows to {output_path}")


if __name__ == "__main__":
    main()
