#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

# Add parent directory to path to import config_loader
sys.path.insert(0, str(Path(__file__).parent))
from config_loader import get_dataset_config, load_config

# Motion category keywords
CATEGORY_KEYWORDS = {
    "transportation": ["transit", "ttc", "road", "bike", "lane", "traffic", "subway", "bus", "streetcar"],
    "housing_development": ["zoning", "development", "building", "housing", "permit", "construction", "real estate"],
    "environment": ["climate", "park", "green", "tree", "environment", "sustainability", "waste", "recycling"],
    "budget_finance": ["tax", "budget", "funding", "levy", "finance", "revenue", "expenditure", "fiscal"],
    "public_safety": ["police", "fire", "emergency", "safety", "security"],
    "social_services": ["community", "support", "service", "social", "childcare", "seniors"],
    "governance": ["council", "procedure", "ethics", "transparency", "committee", "governance"]
}


def ckan_call(endpoint, base_url, timeout):
    """Make a call to the CKAN API"""
    url = f"{base_url}/api/3/action/{endpoint}"
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("error", {}).get("message", "CKAN call failed"))
    return payload["result"]


def download_datastore_resource(resource_id, output_dir, base_url, timeout, page_limit=10000):
    """Download data from CKAN datastore with pagination"""
    output_dir.mkdir(parents=True, exist_ok=True)

    all_records = []
    offset = 0
    total = None

    while True:
        endpoint = f"datastore_search?resource_id={resource_id}&limit={page_limit}&offset={offset}"
        result = ckan_call(endpoint, base_url, timeout)
        records = result.get("records", [])

        # Get total count from first response
        if total is None:
            total = result.get("total", 0)
            print(f"Fetching {total} total records...")

        if not records:
            break

        all_records.extend(records)
        offset += page_limit

        # Stop when we've fetched all records
        if offset >= total:
            break

    if not all_records:
        raise RuntimeError(f"No records found in datastore for resource {resource_id}")

    print(f"Downloaded {len(all_records)} records")
    df = pd.DataFrame(all_records)

    # Save to CSV
    filename = f"voting_record_{resource_id}.csv"
    destination = output_dir / filename
    df.to_csv(destination, index=False)

    return destination


def categorize_motion(motion_title):
    """Categorize a motion based on keywords in its title"""
    if not motion_title or pd.isna(motion_title):
        return "other"

    title_lower = str(motion_title).lower()

    # Count keyword matches for each category
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in title_lower)
        if score > 0:
            scores[category] = score

    # Return category with highest score, or "other" if no matches
    if scores:
        return max(scores, key=scores.get)
    return "other"


def parse_date(date_str):
    """Parse date string to ISO format"""
    if not date_str or pd.isna(date_str):
        return None

    try:
        # Try parsing ISO format first
        dt = pd.to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except:
        return None


def aggregate_vote_results(df, motion_id_col, vote_col, councillor_col=None, first_name_col=None, last_name_col=None):
    """Aggregate vote results per motion"""
    motions = {}

    for _, row in df.iterrows():
        motion_id = row.get(motion_id_col)
        vote = row.get(vote_col)

        if pd.isna(motion_id):
            continue

        if motion_id not in motions:
            motions[motion_id] = {
                "motion_id": str(motion_id),
                "yes_votes": 0,
                "no_votes": 0,
                "absent_votes": 0,
                "votes": []
            }

        # Count votes
        vote_str = str(vote).strip().lower()
        if "yes" in vote_str:
            motions[motion_id]["yes_votes"] += 1
            vote_value = "Yes"
        elif "no" in vote_str:
            motions[motion_id]["no_votes"] += 1
            vote_value = "No"
        else:
            motions[motion_id]["absent_votes"] += 1
            vote_value = "Absent"

        # Build councillor name
        councillor_name = None
        if councillor_col and not pd.isna(row.get(councillor_col)):
            councillor_name = str(row.get(councillor_col))
        elif first_name_col and last_name_col:
            first = row.get(first_name_col, "")
            last = row.get(last_name_col, "")
            if not pd.isna(first) and not pd.isna(last):
                councillor_name = f"{first} {last}".strip()

        # Store individual vote if councillor info available
        if councillor_name:
            motions[motion_id]["votes"].append({
                "councillor_name": councillor_name,
                "vote": vote_value
            })

    return motions


def calculate_vote_outcome(yes_votes, no_votes, absent_votes):
    """Determine if motion passed or failed"""
    total_votes = yes_votes + no_votes
    if total_votes == 0:
        return "unknown"

    # Simple majority
    if yes_votes > no_votes:
        return "passed"
    else:
        return "failed"


def build_column_map(columns):
    """Build flexible column mapping from DataFrame columns"""
    col_map = {}

    columns_lower = {col: col.lower().strip() for col in columns}

    for col, col_lower in columns_lower.items():
        # Motion ID - "Agenda Item #"
        if "agenda item #" in col_lower or "agenda item" in col_lower and "#" in col_lower:
            col_map["motion_id"] = col
        elif "vote number" in col_lower or "motion" in col_lower and "id" in col_lower:
            col_map["motion_id"] = col

        # Vote value - "Vote"
        if col_lower == "vote":
            col_map["vote"] = col
        elif "vote" in col_lower and ("value" in col_lower):
            col_map["vote"] = col

        # Councillor name - "First Name" + "Last Name"
        if "first name" in col_lower:
            col_map["first_name"] = col
        elif "last name" in col_lower:
            col_map["last_name"] = col
        elif "councillor" in col_lower or "member" in col_lower:
            col_map["councillor"] = col

        # Motion description - "Agenda Item Title" or "Vote Description"
        if "agenda item title" in col_lower:
            col_map["motion_title"] = col
        elif "vote description" in col_lower and "motion_title" not in col_map:
            col_map["motion_title"] = col
        elif "result" in col_lower and "description" in col_lower:
            col_map["motion_title"] = col

        # Meeting date - "Date/Time"
        if "date/time" in col_lower or "date" in col_lower and "time" in col_lower:
            col_map["meeting_date"] = col
        elif "meeting" in col_lower and "date" in col_lower:
            col_map["meeting_date"] = col

    return col_map


def filter_recent_months(df, date_col, months=6):
    """Filter DataFrame to include only records from recent months"""
    if date_col not in df.columns:
        return df

    # Use naive datetime for comparison with pandas datetime64
    cutoff_date = datetime.now() - timedelta(days=months * 30)
    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
    df_filtered = df[df[date_col] >= cutoff_date]

    return df_filtered


def run_etl(args):
    """Main ETL process"""
    raw_dir = Path(args.raw_dir)

    # Download voting data
    print(f"Downloading voting data from resource {args.resource_id}...")
    csv_path = download_datastore_resource(
        args.resource_id,
        raw_dir,
        args.ckan_base_url,
        args.ckan_timeout,
        page_limit=args.pagination_limit
    )

    # Load CSV
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} voting records")

    # Build column mapping
    col_map = build_column_map(df.columns)
    print(f"Column mapping: {col_map}")

    if "motion_id" not in col_map or "vote" not in col_map:
        raise RuntimeError(f"Could not find required columns in CSV. Available: {list(df.columns)}")

    # Filter to recent months if requested
    if args.recent_months and "meeting_date" in col_map:
        df = filter_recent_months(df, col_map["meeting_date"], args.recent_months)
        print(f"Filtered to {len(df)} records from last {args.recent_months} months")

    # Aggregate votes by motion
    motions = aggregate_vote_results(
        df,
        col_map["motion_id"],
        col_map["vote"],
        col_map.get("councillor"),
        col_map.get("first_name"),
        col_map.get("last_name")
    )

    print(f"Aggregated {len(motions)} unique motions")

    # Enrich motions with metadata
    records = []
    ingested_at = datetime.now(timezone.utc).isoformat()

    for motion_id, motion_data in motions.items():
        # Find corresponding row for motion metadata
        motion_rows = df[df[col_map["motion_id"]] == motion_id]
        if motion_rows.empty:
            continue

        first_row = motion_rows.iloc[0]

        motion_title = str(first_row.get(col_map.get("motion_title", ""), "")).strip()
        if not motion_title or motion_title == "nan":
            motion_title = f"Motion {motion_id}"

        meeting_date = None
        if "meeting_date" in col_map:
            meeting_date = parse_date(first_row.get(col_map["meeting_date"]))

        # Categorize motion
        motion_category = categorize_motion(motion_title)

        # Calculate outcome
        vote_outcome = calculate_vote_outcome(
            motion_data["yes_votes"],
            motion_data["no_votes"],
            motion_data["absent_votes"]
        )

        vote_margin = motion_data["yes_votes"] - motion_data["no_votes"]

        records.append({
            "meeting_date": meeting_date,
            "motion_id": motion_data["motion_id"],
            "motion_title": motion_title,
            "motion_category": motion_category,
            "vote_outcome": vote_outcome,
            "yes_votes": motion_data["yes_votes"],
            "no_votes": motion_data["no_votes"],
            "absent_votes": motion_data["absent_votes"],
            "vote_margin": vote_margin,
            "votes": motion_data["votes"],
            "source_resource_id": args.resource_id,
            "ingested_at": ingested_at
        })

    # Sort by meeting date (most recent first)
    records.sort(key=lambda x: x["meeting_date"] or "", reverse=True)

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)

    # Print summary
    category_counts = {}
    for record in records:
        cat = record["motion_category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    passed_count = sum(1 for r in records if r["vote_outcome"] == "passed")
    failed_count = sum(1 for r in records if r["vote_outcome"] == "failed")

    print(json.dumps({
        "records_written": len(records),
        "output_file": str(output_path),
        "motions_passed": passed_count,
        "motions_failed": failed_count,
        "pass_rate": round((passed_count / len(records) * 100) if records else 0, 1),
        "categories": category_counts,
        "date_range": {
            "earliest": records[-1]["meeting_date"] if records else None,
            "latest": records[0]["meeting_date"] if records else None
        }
    }, indent=2))


def main():
    # Load configuration
    config = get_dataset_config("council_voting")
    global_config = load_config()

    parser = argparse.ArgumentParser(description="ETL for City Council Voting Records")
    parser.add_argument("--package-id", default=config["package_id"])
    parser.add_argument("--resource-id", default=config.get("resource_id"))
    parser.add_argument("--raw-dir", default=config["raw_dir"])
    parser.add_argument("--output", default=f"{config['processed_dir']}/{config['output_filename']}")
    parser.add_argument("--ckan-base-url", default=config["ckan_base_url"])
    parser.add_argument("--ckan-timeout", type=int, default=config["ckan_timeout"])
    parser.add_argument("--recent-months", type=int, help="Only include votes from recent N months")
    parser.add_argument("--pagination-limit", type=int, default=config.get("pagination_limit", 10000),
                        help="Number of records to fetch per page")

    args = parser.parse_args()
    run_etl(args)


if __name__ == "__main__":
    main()
