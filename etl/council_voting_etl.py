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
        # Clean up weird format like "2025-05-22 16:50 PM" (redundant AM/PM after 24h time)
        cleaned = str(date_str).strip()
        cleaned = re.sub(r'\s+(AM|PM)$', '', cleaned, flags=re.IGNORECASE)
        
        # Try parsing ISO format first
        dt = pd.to_datetime(cleaned)
        return dt.strftime("%Y-%m-%d")
    except:
        return None


def aggregate_vote_results(df, motion_id_col, vote_col, motion_type_col, councillor_col=None, first_name_col=None, last_name_col=None):
    """
    Aggregate vote results per motion with rich per-councillor data.
    
    Output schema per councillor:
    {
      "councillor_name": "Jamaal Myers",
      "final_vote": "Yes",
      "tried_to_amend": true,
      "amendment_votes": { "yes": 3, "no": 1 },
      "tried_to_defer": false,
      "tried_to_refer": false
    }
    """
    motions = {}

    for _, row in df.iterrows():
        motion_id = row.get(motion_id_col)
        vote = row.get(vote_col)
        motion_type = str(row.get(motion_type_col, "")).strip()

        if pd.isna(motion_id):
            continue

        if motion_id not in motions:
            motions[motion_id] = {
                "motion_id": str(motion_id),
                "councillor_data": {},  # Dict for per-councillor aggregation
                "councillor_order": []  # Track order
            }

        # Normalize vote value
        vote_str = str(vote).strip().lower()
        if "yes" in vote_str:
            vote_value = "Yes"
        elif "no" in vote_str:
            vote_value = "No"
        else:
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

        if not councillor_name:
            continue

        # Initialize councillor data if new
        if councillor_name not in motions[motion_id]["councillor_data"]:
            motions[motion_id]["councillor_data"][councillor_name] = {
                "councillor_name": councillor_name,
                "final_vote": None,  # Will be set from Adopt Item votes
                "tried_to_amend": False,
                "amendment_votes": {"yes": 0, "no": 0},
                "tried_to_defer": False,
                "tried_to_refer": False
            }
            motions[motion_id]["councillor_order"].append(councillor_name)

        cdata = motions[motion_id]["councillor_data"][councillor_name]
        motion_type_lower = motion_type.lower()

        # Categorize the vote by motion type
        if "adopt item" in motion_type_lower:
            # Final adoption vote - use "No priority" logic
            # No > Yes > Absent (if they voted No on any adoption, record No)
            if cdata["final_vote"] is None:
                cdata["final_vote"] = vote_value
            elif vote_value == "No":
                cdata["final_vote"] = "No"
            elif vote_value == "Yes" and cdata["final_vote"] == "Absent":
                cdata["final_vote"] = "Yes"
        
        elif "amend" in motion_type_lower:
            # Amendment vote
            cdata["tried_to_amend"] = True
            if vote_value == "Yes":
                cdata["amendment_votes"]["yes"] += 1
            elif vote_value == "No":
                cdata["amendment_votes"]["no"] += 1
        
        elif "defer" in motion_type_lower:
            # Deferral vote - if they voted Yes on defer, they tried to defer
            if vote_value == "Yes":
                cdata["tried_to_defer"] = True
        
        elif "refer" in motion_type_lower:
            # Referral vote - if they voted Yes on refer, they tried to refer
            if vote_value == "Yes":
                cdata["tried_to_refer"] = True

    # Convert councillor data to final format and compute counts
    for motion_id in motions:
        councillor_data = motions[motion_id]["councillor_data"]
        councillor_order = motions[motion_id]["councillor_order"]
        
        # Build votes list in order, only for councillors who have a final vote
        votes_list = []
        yes_votes = 0
        no_votes = 0
        absent_votes = 0
        
        for name in councillor_order:
            cdata = councillor_data[name]
            
            # Only include councillors who have an Adopt Item vote
            if cdata["final_vote"] is not None:
                votes_list.append({
                    "councillor_name": cdata["councillor_name"],
                    "final_vote": cdata["final_vote"],
                    "tried_to_amend": cdata["tried_to_amend"],
                    "amendment_votes": cdata["amendment_votes"],
                    "tried_to_defer": cdata["tried_to_defer"],
                    "tried_to_refer": cdata["tried_to_refer"]
                })
                
                if cdata["final_vote"] == "Yes":
                    yes_votes += 1
                elif cdata["final_vote"] == "No":
                    no_votes += 1
                else:
                    absent_votes += 1
        
        motions[motion_id]["votes"] = votes_list
        motions[motion_id]["yes_votes"] = yes_votes
        motions[motion_id]["no_votes"] = no_votes
        motions[motion_id]["absent_votes"] = absent_votes
        
        # Clean up temporary fields
        del motions[motion_id]["councillor_data"]
        del motions[motion_id]["councillor_order"]

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

        # Agenda title + vote description
        if "agenda item title" in col_lower or "motion title" in col_lower or "agenda title" in col_lower:
            col_map.setdefault("agenda_item_title", col)
        elif "vote description" in col_lower:
            col_map.setdefault("vote_description", col)
        elif "result" in col_lower and "description" in col_lower:
            col_map.setdefault("vote_description", col)

        # Meeting date - "Date/Time"
        if "date/time" in col_lower or "date" in col_lower and "time" in col_lower:
            col_map["meeting_date"] = col
        elif "meeting" in col_lower and "date" in col_lower:
            col_map["meeting_date"] = col

        # Motion type - "Motion Type"
        if "motion type" in col_lower or "motion" in col_lower and "type" in col_lower:
            col_map["motion_type"] = col

    return col_map


def clean_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return ""
    return text


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

    # We need motion_type column to categorize votes
    if "motion_type" not in col_map:
        raise RuntimeError("Could not find 'Motion Type' column required for vote categorization")

    # Show motion type distribution for debugging
    motion_type_col = col_map["motion_type"]
    print(f"Motion types in data:")
    print(df[motion_type_col].value_counts().head(10).to_string())

    # Aggregate votes by motion - processing ALL motion types
    # The aggregator will categorize: Adopt Item → final_vote, Amend → amendment tracking, etc.
    motions = aggregate_vote_results(
        df,
        col_map["motion_id"],
        col_map["vote"],
        motion_type_col,
        col_map.get("councillor"),
        col_map.get("first_name"),
        col_map.get("last_name")
    )

    print(f"Aggregated {len(motions)} unique motions")

    # Enrich motions with metadata
    records = []
    ingested_at = datetime.now(timezone.utc).isoformat()

    # Create filtered DataFrame for metadata lookup (prefer Adopt Item rows for titles)
    adopt_df = df[df[motion_type_col].str.contains("Adopt Item", case=False, na=False)]

    for motion_id, motion_data in motions.items():
        # Skip motions with no final votes (no Adopt Item votes found)
        if not motion_data["votes"]:
            continue

        # Find corresponding row for motion metadata - prefer Adopt Item rows
        motion_rows = adopt_df[adopt_df[col_map["motion_id"]] == motion_id]
        if motion_rows.empty:
            # Fall back to any row for this motion
            motion_rows = df[df[col_map["motion_id"]] == motion_id]
        if motion_rows.empty:
            continue

        first_row = motion_rows.iloc[0]

        agenda_title = ""
        vote_description = ""
        agenda_col = col_map.get("agenda_item_title")
        vote_desc_col = col_map.get("vote_description")
        if agenda_col:
            agenda_title = clean_text(first_row.get(agenda_col))
        if vote_desc_col:
            vote_description = clean_text(first_row.get(vote_desc_col))

        motion_title = agenda_title or vote_description or f"Motion {motion_id}"

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
            "agenda_item_title": agenda_title,
            "vote_description": vote_description,
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
