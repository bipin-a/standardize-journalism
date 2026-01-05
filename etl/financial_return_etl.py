#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

# Add parent directory to path to import config_loader
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


def parse_iso_datetime(value):
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def select_resources(resources):
    """Select all XLSX resources, newest first"""
    candidates = [
        resource
        for resource in resources
        if str(resource.get("format", "")).lower() == "xlsx"
    ]

    if not candidates:
        raise RuntimeError("No XLSX resources found in the package.")

    candidates.sort(
        key=lambda resource: parse_iso_datetime(
            resource.get("last_modified") or resource.get("created")
        ),
        reverse=True,
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


def clean_description(text):
    cleaned = re.sub(r"\s+", " ", str(text)).strip()
    cleaned = re.sub(r"\s*\(.*?\)\s*$", "", cleaned).strip()
    return cleaned


def parse_number(value):
    """Parse numeric value from various formats"""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text or text.lower() in {'na', 'n/a', '-', ''}:
        return None

    # Handle negative numbers in parentheses
    is_negative = text.startswith("(") and text.endswith(")")
    if is_negative:
        text = text[1:-1]

    # Remove currency symbols and commas
    cleaned = text.replace("$", "").replace(",", "")
    try:
        number = float(cleaned)
    except ValueError:
        return None

    return -number if is_negative else number


def extract_year_from_text(value):
    match = re.search(r"20\d{2}", str(value))
    if match:
        return int(match.group(0))
    return None


def is_summary_row(description):
    lowered = str(description).strip().lower()
    if "subtotal" in lowered:
        return True
    if lowered == "total":
        return True
    if lowered.startswith("total "):
        return True
    summary_phrases = [
        "plus: total",
        "less: total",
        "annual surplus",
        "annual deficit",
        "accumulated surplus",
        "restated accumulated surplus",
        "recognized in the year",
        "continuity of",
        "government business enterprise equity",
        "plus: net income",
        "less: dividends",
    ]
    if any(phrase in lowered for phrase in summary_phrases):
        return True
    return False


def extract_summary_totals(df, desc_col, amount_col):
    totals = {}
    for _, row in df.iterrows():
        description = row.get(desc_col)
        if pd.isna(description) or str(description).strip() == "":
            continue
        cleaned = clean_description(description)
        if not cleaned:
            continue
        lowered = cleaned.lower()
        amount = parse_number(row.get(amount_col))
        if amount is None:
            continue

        def update_total(key):
            current = totals.get(key)
            if current is None or abs(amount) > abs(current):
                totals[key] = amount

        if "plus: total revenues" in lowered or lowered == "total revenues":
            update_total("reported_revenue_total")
        elif "less: total expenses" in lowered or lowered == "total expenses":
            update_total("reported_expense_total")
        elif "annual surplus" in lowered or "annual deficit" in lowered:
            update_total("annual_surplus")

    return totals


def detect_year_in_sheet(df):
    for value in df.head(10).values.flatten():
        year = extract_year_from_text(value)
        if year:
            return year
    return None


def detect_description_column(df, fallback_index=None):
    best_col = None
    best_score = 0
    best_count = 0

    for col in df.columns:
        values = [v for v in df[col].values if isinstance(v, str) and v.strip()]
        if not values:
            continue
        avg_len = sum(len(v.strip()) for v in values) / len(values)
        if avg_len > best_score:
            best_score = avg_len
            best_col = col
            best_count = len(values)

    if fallback_index is not None and fallback_index in df.columns:
        if best_col is None or best_count < 10:
            return fallback_index

    return best_col if best_col is not None else df.columns[0]


def detect_amount_column(df, markers, fallback_index=None):
    search_rows = min(20, len(df.index))
    for row_idx in range(search_rows):
        row = df.iloc[row_idx]
        for col in df.columns:
            value = row[col]
            if isinstance(value, str):
                lowered = value.lower()
                if any(marker in lowered for marker in markers):
                    return col

    if fallback_index is not None and fallback_index in df.columns:
        return fallback_index

    numeric_counts = {}
    for col in df.columns:
        count = 0
        for value in df[col].values:
            if parse_number(value) is not None:
                count += 1
        numeric_counts[col] = count

    if not numeric_counts:
        raise RuntimeError("Could not detect a numeric amount column.")

    return max(numeric_counts, key=numeric_counts.get)


def column_numeric_ratio(df, column):
    if column not in df.columns:
        return 0
    total = 0
    numeric = 0
    for value in df[column].values:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            continue
        total += 1
        if parse_number(value) is not None:
            numeric += 1
    return (numeric / total) if total else 0


def parse_sheet(df, flow_type, fiscal_year, amount_col, desc_col, source_meta):
    records = []

    for _, row in df.iterrows():
        description = row.get(desc_col)
        if pd.isna(description) or str(description).strip() == "":
            continue

        cleaned_description = clean_description(description)
        if not cleaned_description or is_summary_row(cleaned_description):
            continue

        amount_raw = parse_number(row.get(amount_col))
        if amount_raw is None or amount_raw == 0:
            continue

        records.append({
            "fiscal_year": fiscal_year,
            "flow_type": flow_type,
            "label": cleaned_description,
            "line_description": str(description).strip(),
            "amount": amount_raw,
            "source_file": source_meta.get("source_file"),
            "source_resource_id": source_meta.get("source_resource_id"),
            "source_resource_name": source_meta.get("source_resource_name")
        })

    return records


def aggregate_records(records):
    """Aggregate records by year, flow_type, and label"""
    aggregated = []
    totals = {}

    for record in records:
        key = (record["fiscal_year"], record["flow_type"], record["label"])
        current = totals.get(key)
        if current is None:
            totals[key] = {
                "fiscal_year": record["fiscal_year"],
                "flow_type": record["flow_type"],
                "label": record["label"],
                "line_description": record["line_description"],
                "amount": record["amount"],
                "source_files": {record.get("source_file")},
                "source_resource_ids": {record.get("source_resource_id")},
                "source_resource_names": {record.get("source_resource_name")}
            }
        else:
            current["amount"] += record["amount"]
            current["source_files"].add(record.get("source_file"))
            current["source_resource_ids"].add(record.get("source_resource_id"))
            current["source_resource_names"].add(record.get("source_resource_name"))

    for item in totals.values():
        item["source_files"] = sorted({value for value in item["source_files"] if value})
        item["source_resource_ids"] = sorted({value for value in item["source_resource_ids"] if value})
        item["source_resource_names"] = sorted({value for value in item["source_resource_names"] if value})
        aggregated.append(item)

    return aggregated


def run_etl(args):
    package = ckan_call(f"package_show?id={args.package_id}", args.ckan_base_url, args.ckan_timeout)
    resources = package.get("resources", [])

    output_dir = Path(args.output).parent
    raw_dir = Path(args.raw_dir)

    resources = select_resources(resources)
    all_records = []
    processed_resources = []
    failed_resources = []
    summary_by_year = {}
    summary_sources = {}

    def merge_summary_totals(year, totals, source_meta):
        if not totals:
            return
        year_key = str(year)
        year_totals = summary_by_year.setdefault(year_key, {})
        for key, value in totals.items():
            existing = year_totals.get(key)
            if existing is None or abs(value) > abs(existing):
                year_totals[key] = value
        summary_sources.setdefault(year_key, []).append(source_meta)

    for resource in resources:
        try:
            local_path = download_resource(resource, raw_dir, args.download_timeout)
            excel_file = pd.ExcelFile(local_path)

            revenue_sheet = None
            expense_sheet = None

            for sheet_name in excel_file.sheet_names:
                sheet_lower = sheet_name.lower()
                if "revenue" in sheet_lower:
                    revenue_sheet = sheet_name
                elif "expense" in sheet_lower:
                    expense_sheet = sheet_name

            if not revenue_sheet:
                for sheet_name in excel_file.sheet_names:
                    sheet_lower = sheet_name.lower()
                    if "schedule 10" in sheet_lower or "sch 10" in sheet_lower or "sch10" in sheet_lower:
                        revenue_sheet = sheet_name
                        break

            if not expense_sheet:
                for sheet_name in excel_file.sheet_names:
                    sheet_lower = sheet_name.lower()
                    if "schedule 40" in sheet_lower or "sch 40" in sheet_lower or "sch40" in sheet_lower:
                        expense_sheet = sheet_name
                        break

            if not revenue_sheet or not expense_sheet:
                raise RuntimeError(f"Missing revenue or expense sheet in {excel_file.sheet_names}")

            df_revenue = pd.read_excel(excel_file, sheet_name=revenue_sheet, header=None)
            df_expenditure = pd.read_excel(excel_file, sheet_name=expense_sheet, header=None)

            detected_year = detect_year_in_sheet(df_revenue) or detect_year_in_sheet(df_expenditure)
            if not detected_year:
                detected_year = extract_year_from_text(local_path.name)

            if args.fiscal_years:
                if detected_year not in args.fiscal_years:
                    continue
                fiscal_year = detected_year
            elif detected_year:
                fiscal_year = detected_year
            else:
                raise RuntimeError("Could not determine fiscal year.")

            revenue_desc_col = detect_description_column(df_revenue, fallback_index=3)
            expense_desc_col = detect_description_column(df_expenditure, fallback_index=3)

            revenue_amount_col = detect_amount_column(
                df_revenue,
                markers=["own purposes revenue", "total revenues"],
                fallback_index=9
            )
            expense_amount_col = detect_amount_column(
                df_expenditure,
                markers=["total expenses"],
                fallback_index=17
            )

            if column_numeric_ratio(df_revenue, revenue_amount_col) < 0.05 and 9 in df_revenue.columns:
                revenue_amount_col = 9
            if column_numeric_ratio(df_expenditure, expense_amount_col) < 0.05 and 17 in df_expenditure.columns:
                expense_amount_col = 17

            # Validate detected columns have non-empty data
            def validate_column(df, col_index, col_name):
                if col_index is None or col_index >= len(df.columns):
                    raise ValueError(f"Could not detect {col_name}. Check Excel schema.")

                col_data = df.iloc[:, col_index]
                non_null_count = col_data.notna().sum()
                if non_null_count == 0:
                    raise ValueError(f"Detected {col_name} at index {col_index} but column is empty.")

                print(f"✓ {col_name} detected at column {col_index} ({non_null_count} non-null values)")

            validate_column(df_revenue, revenue_desc_col, "Revenue description")
            validate_column(df_revenue, revenue_amount_col, "Revenue amount")
            validate_column(df_expenditure, expense_desc_col, "Expense description")
            validate_column(df_expenditure, expense_amount_col, "Expense amount")

            source_meta = {
                "source_file": local_path.name,
                "source_resource_id": resource.get("id"),
                "source_resource_name": resource.get("name")
            }

            revenue_totals = extract_summary_totals(
                df_revenue,
                revenue_desc_col,
                revenue_amount_col
            )
            expense_totals = extract_summary_totals(
                df_expenditure,
                expense_desc_col,
                expense_amount_col
            )
            merge_summary_totals(fiscal_year, revenue_totals, source_meta)
            merge_summary_totals(fiscal_year, expense_totals, source_meta)

            revenue_records = parse_sheet(
                df_revenue,
                "revenue",
                fiscal_year,
                revenue_amount_col,
                revenue_desc_col,
                source_meta
            )
            expenditure_records = parse_sheet(
                df_expenditure,
                "expenditure",
                fiscal_year,
                expense_amount_col,
                expense_desc_col,
                source_meta
            )

            all_records.extend(revenue_records + expenditure_records)
            processed_resources.append({
                "resource_id": resource.get("id"),
                "resource_name": resource.get("name"),
                "downloaded_file": str(local_path),
                "revenue_sheet": revenue_sheet,
                "expense_sheet": expense_sheet,
                "fiscal_year": fiscal_year,
                "revenue_rows_parsed": len(revenue_records),
                "expense_rows_parsed": len(expenditure_records),
                "revenue_desc_col": revenue_desc_col,
                "revenue_amount_col": revenue_amount_col,
                "expense_desc_col": expense_desc_col,
                "expense_amount_col": expense_amount_col
            })
        except Exception as exc:
            failed_resources.append({
                "resource_id": resource.get("id"),
                "resource_name": resource.get("name"),
                "error": str(exc)
            })

    if not all_records:
        raise RuntimeError("No records parsed from any resources.")

    # Combine and aggregate
    aggregated_records = aggregate_records(all_records)

    # Add metadata
    ingested_at = datetime.now(timezone.utc).isoformat()
    for record in aggregated_records:
        record['source_package_id'] = args.package_id
        record['ingested_at'] = ingested_at

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(aggregated_records, f, indent=2)

    if summary_by_year:
        totals_payload = {
            "generated_at": ingested_at,
            "years": summary_by_year,
            "sources": summary_sources
        }
        totals_path = output_path.parent / "financial_return_totals.json"
        with open(totals_path, "w", encoding="utf-8") as f:
            json.dump(totals_payload, f, indent=2)

    # Print summary
    years_found = sorted(set(r['fiscal_year'] for r in aggregated_records))
    latest_year = years_found[-1] if years_found else None
    revenue_total = sum(r['amount'] for r in aggregated_records if r['flow_type'] == 'revenue' and r['fiscal_year'] == latest_year)
    expenditure_total = sum(r['amount'] for r in aggregated_records if r['flow_type'] == 'expenditure' and r['fiscal_year'] == latest_year)

    print(json.dumps({
        "records_written": len(aggregated_records),
        "output_file": str(output_path),
        "fiscal_years": years_found,
        "latest_year": latest_year,
        "latest_revenue_total": revenue_total,
        "latest_expenditure_total": expenditure_total,
        "balance": revenue_total - expenditure_total,
        "resources_processed": processed_resources,
        "resources_failed": failed_resources
    }, indent=2))


def main():
    # Load configuration
    config = get_dataset_config("financial_return")
    global_config = load_config()

    parser = argparse.ArgumentParser(description="ETL for Financial Information Return (Schedule 10 & 40).")
    parser.add_argument("--package-id", default=config["package_id"])
    parser.add_argument("--raw-dir", default=config["raw_dir"])
    parser.add_argument("--output", default=f"{config['processed_dir']}/{config['output_filename']}")
    parser.add_argument("--ckan-base-url", default=config["ckan_base_url"])
    parser.add_argument("--ckan-timeout", type=int, default=config["ckan_timeout"])
    parser.add_argument("--download-timeout", type=int, default=config["ckan_download_timeout"])
    parser.add_argument("--fiscal-years", type=int, nargs='+', help="Fiscal years to extract (e.g., 2024 2023 2022)")

    args = parser.parse_args()
    run_etl(args)


if __name__ == "__main__":
    main()
