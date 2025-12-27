#!/usr/bin/env python3
"""
Generate gold summaries from existing processed files.
This script can be run standalone without re-running the full ETL pipeline.
"""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from publish_data_gcs import (
    build_money_flow_summary,
    build_capital_summary,
    build_council_summary,
    load_json_list,
    load_records_with_year_range
)
from config_loader import load_config


def main():
    config = load_config()
    storage = config.get("storage", {})
    gcp = config.get("gcp", {})
    bucket_name = gcp.get("bucket_name", "")

    processed_dir = Path(storage.get("processed_dir", "data/processed"))
    gold_dir = Path(storage.get("gold_dir", "data/gold"))
    gold_dir.mkdir(parents=True, exist_ok=True)

    financial_path = processed_dir / "financial_return.json"
    capital_path = processed_dir / "capital_by_ward.json"
    council_path = processed_dir / "council_voting.json"
    lobbyist_path = processed_dir / "lobbyist_activity.json"
    council_summary_path = processed_dir / "council_summary.json"

    print("Generating gold summaries from processed files...")

    # Load datasets
    print("Loading processed files...")
    financial_records = load_json_list(financial_path, "Financial return")
    capital_records = load_json_list(capital_path, "Capital budget")

    # Get available years
    financial_years = sorted({int(r["fiscal_year"]) for r in financial_records if "fiscal_year" in r})
    capital_years = sorted({int(r["fiscal_year"]) for r in capital_records if "fiscal_year" in r})

    print(f"Found financial years: {financial_years}")
    print(f"Found capital years: {capital_years}")

    # Generate money-flow gold files (one per year)
    money_flow_gold_dir = gold_dir / "money-flow"
    money_flow_gold_dir.mkdir(parents=True, exist_ok=True)
    for year in financial_years:
        print(f"  Generating money-flow summary for {year}...")
        summary = build_money_flow_summary(year, financial_records, financial_years)
        gold_path = money_flow_gold_dir / f"{year}.json"
        with open(gold_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"    ✓ Wrote {gold_path}")
    money_flow_index = {
        "availableYears": financial_years,
        "latestYear": financial_years[-1] if financial_years else None,
        "files": {
            str(year): f"https://storage.googleapis.com/{bucket_name}/gold/money-flow/{year}.json"
            for year in financial_years
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    money_flow_index_path = money_flow_gold_dir / "index.json"
    with open(money_flow_index_path, "w", encoding="utf-8") as f:
        json.dump(money_flow_index, f, indent=2)
    print(f"    ✓ Wrote {money_flow_index_path}")

    # Generate capital gold files (one per year)
    capital_gold_dir = gold_dir / "capital"
    capital_gold_dir.mkdir(parents=True, exist_ok=True)
    for year in capital_years:
        print(f"  Generating capital summary for {year}...")
        summary = build_capital_summary(year, capital_records, capital_years)
        gold_path = capital_gold_dir / f"{year}.json"
        with open(gold_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"    ✓ Wrote {gold_path}")
    capital_index = {
        "availableYears": capital_years,
        "latestYear": capital_years[-1] if capital_years else None,
        "files": {
            str(year): f"https://storage.googleapis.com/{bucket_name}/gold/capital/{year}.json"
            for year in capital_years
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    capital_index_path = capital_gold_dir / "index.json"
    with open(capital_index_path, "w", encoding="utf-8") as f:
        json.dump(capital_index, f, indent=2)
    print(f"    ✓ Wrote {capital_index_path}")

    # Generate/copy council summary to gold directory
    if council_summary_path.exists():
        council_gold_dir = gold_dir / "council-decisions"
        council_gold_dir.mkdir(parents=True, exist_ok=True)
        council_gold_path = council_gold_dir / "summary.json"
        shutil.copy(council_summary_path, council_gold_path)
        print(f"  ✓ Copied council summary to {council_gold_path}")
    else:
        # Generate it if it doesn't exist
        print("  Generating council summary...")
        council_records, _, _ = load_records_with_year_range(
            council_path, "Council voting", ["meeting_date"]
        )
        lobbyist_records, _, _ = load_records_with_year_range(
            lobbyist_path, "Lobbyist registry", ["communication_date", "registration_date"]
        )
        council_summary = build_council_summary(council_records, lobbyist_records, recent_days=365)

        council_gold_dir = gold_dir / "council-decisions"
        council_gold_dir.mkdir(parents=True, exist_ok=True)
        council_gold_path = council_gold_dir / "summary.json"
        with open(council_gold_path, "w", encoding="utf-8") as f:
            json.dump(council_summary, f, indent=2)
        print(f"    ✓ Wrote {council_gold_path}")

    print("\n✅ Gold file generation complete!")
    print(f"\nGenerated files:")
    print(f"  Money-flow: {len(financial_years)} files + index in {money_flow_gold_dir}/")
    print(f"  Capital: {len(capital_years)} files + index in {capital_gold_dir}/")
    print(f"  Council: 1 file in {gold_dir}/council-decisions/")


if __name__ == "__main__":
    main()
