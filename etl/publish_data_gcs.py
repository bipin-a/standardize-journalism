#!/usr/bin/env python3
import json
import hashlib
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
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


def get_git_commit():
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def sha256_file(path):
    hasher = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def file_stats(path):
    return {
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


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


def load_json_list(json_path, label):
    if not json_path.exists():
        raise RuntimeError(f"{label} file not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list) or not data:
        raise RuntimeError(f"{label} data is empty")

    return data


def load_year_range(json_path, label):
    data = load_json_list(json_path, label)
    years = sorted({int(row["fiscal_year"]) for row in data if "fiscal_year" in row})
    if not years:
        raise RuntimeError(f"No fiscal years found in {label} data")

    return years[0], years[-1]


def load_records_with_year_range(json_path, label, keys):
    data = load_json_list(json_path, label)

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
    return data, years[0], years[-1]


def aggregate_by_label_money_flow(records):
    """
    Mirrors /api/money-flow/route.js aggregateByLabel() logic.
    Aggregates financial records by label.
    """
    totals = {}
    for record in records:
        label = record.get("label") or record.get("line_description")
        if not label:
            continue

        try:
            amount = float(record.get("amount", 0))
        except (ValueError, TypeError):
            continue

        if label not in totals:
            totals[label] = {"label": label, "amount": 0}
        totals[label]["amount"] += amount

    return list(totals.values())


def build_top_bottom_groups_money_flow(records, group_limit=7):
    """
    Mirrors /api/money-flow/route.js buildTopBottomGroups() logic.
    Returns top and bottom groups with percentages.
    """
    # Filter positive amounts only
    positive = [item for item in records if item["amount"] > 0]
    # Sort by amount descending
    sorted_records = sorted(positive, key=lambda x: x["amount"], reverse=True)

    # Get top groups
    top_groups = sorted_records[:group_limit]
    top_labels = {g["label"] for g in top_groups}

    # Get bottom groups (excluding any that are in top)
    bottom_groups = [
        g for g in sorted_records[-group_limit:]
        if g["label"] not in top_labels
    ]
    # Sort bottom groups by amount ascending
    bottom_groups.sort(key=lambda x: x["amount"])

    # Calculate total
    total = sum(item["amount"] for item in positive)

    # Add percentages
    def add_percentages(groups):
        return [
            {
                **group,
                "percentage": (group["amount"] / total * 100) if total > 0 else 0
            }
            for group in groups
        ]

    return {
        "total": total,
        "topGroups": add_percentages(top_groups),
        "bottomGroups": add_percentages(bottom_groups)
    }


def build_gold_index(years, base_url):
    if not years:
        return {
            "availableYears": [],
            "latestYear": None,
            "files": {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    return {
        "availableYears": years,
        "latestYear": years[-1],
        "files": {str(year): f"{base_url}/{year}.json" for year in years},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def build_money_flow_summary(year, all_records, available_years):
    """
    Mirrors /api/money-flow/route.js aggregation logic.
    Returns same shape as API response.
    """
    # Filter by year
    year_records = [r for r in all_records if r.get("fiscal_year") == year]
    revenue_records = [r for r in year_records if r.get("flow_type") == "revenue"]
    expense_records = [r for r in year_records if r.get("flow_type") == "expenditure"]

    # Aggregate
    revenue_aggregated = aggregate_by_label_money_flow(revenue_records)
    expense_aggregated = aggregate_by_label_money_flow(expense_records)

    revenue = build_top_bottom_groups_money_flow(revenue_aggregated)
    expenditure = build_top_bottom_groups_money_flow(expense_aggregated)

    balance_amount = revenue["total"] - expenditure["total"]

    return {
        "year": year,
        "availableYears": available_years,
        "revenue": revenue,
        "expenditure": expenditure,
        "balance": {
            "amount": balance_amount,
            "isSurplus": balance_amount >= 0,
            "percentageOfRevenue": (balance_amount / revenue["total"] * 100) if revenue["total"] > 0 else 0
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def aggregate_by_ward_capital(records):
    """
    Mirrors /api/capital-by-ward/route.js aggregateByWard() logic.
    """
    ward_totals = {}

    for record in records:
        ward_key = f"{record.get('ward_number')}|{record.get('ward_name')}"

        if ward_key not in ward_totals:
            ward_totals[ward_key] = {
                "ward_number": record.get("ward_number"),
                "ward_name": record.get("ward_name"),
                "totalAmount": 0,
                "projectCount": 0,
                "categories": {}
            }

        ward_totals[ward_key]["totalAmount"] += record.get("amount", 0)
        ward_totals[ward_key]["projectCount"] += 1

        # Track spending by category
        category = record.get("category")
        if category:
            ward_totals[ward_key]["categories"][category] = \
                ward_totals[ward_key]["categories"].get(category, 0) + record.get("amount", 0)

    # Convert to list and add topCategory
    result = []
    for ward in ward_totals.values():
        top_category = None
        if ward["categories"]:
            top_category = max(ward["categories"].items(), key=lambda x: x[1])[0]

        result.append({
            "ward_number": ward["ward_number"],
            "ward_name": ward["ward_name"],
            "totalAmount": ward["totalAmount"],
            "projectCount": ward["projectCount"],
            "topCategory": top_category
        })

    # Sort by totalAmount descending
    result.sort(key=lambda x: x["totalAmount"], reverse=True)
    return result


def aggregate_by_category_capital(records):
    """
    Mirrors /api/capital-by-ward/route.js aggregateByCategory() logic.
    """
    category_totals = {}

    for record in records:
        category = record.get("category")
        if not category:
            continue

        if category not in category_totals:
            category_totals[category] = {
                "name": category,
                "totalAmount": 0,
                "projectCount": 0
            }

        category_totals[category]["totalAmount"] += record.get("amount", 0)
        category_totals[category]["projectCount"] += 1

    # Convert to list and sort
    result = list(category_totals.values())
    result.sort(key=lambda x: x["totalAmount"], reverse=True)
    return result


def get_top_projects_capital(records, limit=10):
    """
    Mirrors /api/capital-by-ward/route.js getTopProjects() logic.
    """
    project_map = {}

    for record in records:
        project_name = record.get("project_name")
        if not project_name:
            continue

        key = f"{project_name}|{record.get('ward_name')}"

        if key not in project_map:
            project_map[key] = {
                "project_name": project_name,
                "ward_name": record.get("ward_name"),
                "ward_number": record.get("ward_number"),
                "program_name": record.get("program_name"),
                "category": record.get("category"),
                "amount": 0
            }

        project_map[key]["amount"] += record.get("amount", 0)

    # Convert to list, sort, and limit
    result = list(project_map.values())
    result.sort(key=lambda x: x["amount"], reverse=True)
    return result[:limit]


def build_capital_summary(year, all_records, available_years):
    """
    Mirrors /api/capital-by-ward/route.js aggregation logic.
    Returns same shape as API response.
    """
    # Filter by year
    year_records = [r for r in all_records if r.get("fiscal_year") == year]

    # Separate City Wide from ward-specific
    city_wide_records = [r for r in year_records if r.get("ward_number") == 0]
    ward_records = [r for r in year_records if r.get("ward_number") != 0]

    # Aggregate by ward
    ward_totals = aggregate_by_ward_capital(ward_records)
    city_wide_total = sum(r.get("amount", 0) for r in city_wide_records)

    # Calculate totals
    ward_specific_total = sum(w["totalAmount"] for w in ward_totals)
    grand_total = ward_specific_total + city_wide_total

    # Get top and bottom wards
    top_wards = ward_totals[:5]
    bottom_wards = list(reversed(ward_totals[-5:]))

    # Calculate concentration metrics
    top1_share = (ward_totals[0]["totalAmount"] / ward_specific_total * 100) if len(ward_totals) > 0 and ward_specific_total > 0 else 0
    top5_share = (sum(w["totalAmount"] for w in top_wards) / ward_specific_total * 100) if len(top_wards) > 0 and ward_specific_total > 0 else 0
    disparity_ratio = (ward_totals[0]["totalAmount"] / ward_totals[-1]["totalAmount"]) if len(ward_totals) > 1 and ward_totals[-1]["totalAmount"] > 0 else 1

    # Category breakdown (ward-specific only)
    category_breakdown = aggregate_by_category_capital(ward_records)

    # Top projects across all wards
    top_projects = get_top_projects_capital(ward_records, 10)

    return {
        "year": year,
        "totalInvestment": grand_total,
        "wardSpecificInvestment": ward_specific_total,
        "cityWideInvestment": city_wide_total,
        "wardCount": len(ward_totals),
        "cityWideProjectCount": len(city_wide_records),
        "topWards": top_wards,
        "bottomWards": bottom_wards,
        "allWards": ward_totals,
        "categoryBreakdown": category_breakdown[:5],
        "topProjects": top_projects,
        "governance": {
            "top1WardShare": top1_share,
            "top5WardShare": top5_share,
            "disparityRatio": disparity_ratio
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def get_category_label(category):
    labels = {
        "transportation": "Transit & Transportation",
        "housing_development": "Housing & Development",
        "environment": "Environment & Climate",
        "budget_finance": "Budget & Taxes",
        "public_safety": "Police & Safety",
        "social_services": "Community Services",
        "governance": "Council Operations",
        "other": "Other",
    }
    return labels.get(category, category)


def aggregate_decision_categories(motions):
    categories = {}
    for motion in motions:
        cat = motion.get("motion_category") or "other"
        if cat not in categories:
            categories[cat] = {
                "category": cat,
                "label": get_category_label(cat),
                "total_motions": 0,
                "passed": 0,
                "failed": 0,
            }
        categories[cat]["total_motions"] += 1
        if motion.get("vote_outcome") == "passed":
            categories[cat]["passed"] += 1
        elif motion.get("vote_outcome") == "failed":
            categories[cat]["failed"] += 1

    category_list = []
    for cat in categories.values():
        pass_rate = (cat["passed"] / cat["total_motions"] * 100) if cat["total_motions"] else 0
        category_list.append({**cat, "pass_rate": pass_rate})

    category_list.sort(key=lambda item: item["total_motions"], reverse=True)
    return category_list


def aggregate_councillor_voting(motions):
    councillors = {}
    for motion in motions:
        votes = motion.get("votes")
        if not isinstance(votes, list):
            continue
        for vote in votes:
            name = vote.get("councillor_name")
            if not name:
                continue
            if name not in councillors:
                councillors[name] = {
                    "councillor_name": name,
                    "votes_cast": 0,
                    "yes_votes": 0,
                    "no_votes": 0,
                    "absent": 0,
                }
            councillors[name]["votes_cast"] += 1
            if vote.get("vote") == "Yes":
                councillors[name]["yes_votes"] += 1
            elif vote.get("vote") == "No":
                councillors[name]["no_votes"] += 1
            else:
                councillors[name]["absent"] += 1

    total_motions = len(motions)
    councillor_list = []
    for item in councillors.values():
        participation = (item["votes_cast"] / total_motions * 100) if total_motions else 0
        councillor_list.append({**item, "participation_rate": participation})

    councillor_list.sort(key=lambda item: item["participation_rate"], reverse=True)
    return councillor_list


def aggregate_lobbying_summary(records):
    subjects = {}
    active_registrations = 0
    recent_communications = 0

    for record in records:
        active_registrations += 1
        if record.get("communication_date"):
            recent_communications += 1
        cat = record.get("subject_category") or "other"
        subjects[cat] = subjects.get(cat, 0) + 1

    top_subjects = [
        cat for cat, _ in sorted(subjects.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    return {
        "active_registrations": active_registrations,
        "recent_communications": recent_communications,
        "top_subjects": top_subjects,
    }


def build_council_summary(motions, lobbyist_records, recent_days=365):
    cutoff = datetime.utcnow() - timedelta(days=recent_days)

    recent_motions = []
    for motion in motions:
        meeting_date = motion.get("meeting_date")
        if not meeting_date:
            continue
        try:
            parsed_date = datetime.fromisoformat(meeting_date)
        except ValueError:
            continue
        if parsed_date >= cutoff:
            recent_motions.append(motion)

    recent_motions.sort(key=lambda item: item.get("meeting_date") or "", reverse=True)

    recent_decisions = []
    for motion in recent_motions[:20]:
        yes_votes = motion.get("yes_votes", 0) or 0
        no_votes = motion.get("no_votes", 0) or 0
        absent_votes = motion.get("absent_votes", 0) or 0
        total_votes = yes_votes + no_votes
        margin = (yes_votes / total_votes * 100) if total_votes else 0
        recent_decisions.append({
            "meeting_date": motion.get("meeting_date"),
            "motion_id": motion.get("motion_id"),
            "motion_title": motion.get("motion_title"),
            "motion_category": motion.get("motion_category"),
            "vote_outcome": motion.get("vote_outcome"),
            "yes_votes": yes_votes,
            "no_votes": no_votes,
            "absent_votes": absent_votes,
            "vote_margin_percent": f"{margin:.1f}",
        })

    decision_categories = aggregate_decision_categories(recent_motions)
    councillor_voting = aggregate_councillor_voting(recent_motions)[:25]
    lobbying_summary = aggregate_lobbying_summary(lobbyist_records)

    passed_count = sum(1 for motion in recent_motions if motion.get("vote_outcome") == "passed")
    failed_count = sum(1 for motion in recent_motions if motion.get("vote_outcome") == "failed")
    pass_rate = (passed_count / len(recent_motions) * 100) if recent_motions else 0

    latest_year = None
    for motion in recent_motions:
        year = parse_year(motion.get("meeting_date"))
        if year:
            latest_year = max(latest_year or year, year)

    return {
        "recent_decisions": recent_decisions,
        "decision_categories": decision_categories,
        "councillor_voting_patterns": councillor_voting,
        "lobbying_summary": lobbying_summary,
        "metadata": {
            "year": latest_year or datetime.utcnow().year,
            "recent_days": recent_days,
            "total_motions": len(recent_motions),
            "motions_passed": passed_count,
            "motions_failed": failed_count,
            "pass_rate": f"{pass_rate:.1f}",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


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
    council_summary_config = datasets.get("council_summary", {})
    lobbyist_config = datasets.get("lobbyist_registry", {})
    ward_geojson_config = datasets.get("ward_geojson", {})

    capital_csv_name = capital_config.get("output_filename")
    capital_json_name = capital_config.get("json_output_filename")
    financial_name = financial_config.get("output_filename")
    council_name = council_config.get("output_filename")
    council_summary_name = council_summary_config.get("output_filename")
    lobbyist_name = lobbyist_config.get("output_filename")
    ward_geojson_name = ward_geojson_config.get("output_filename")
    ward_geojson_resource_id = ward_geojson_config.get("resource_id")

    if not capital_csv_name or not capital_json_name or not financial_name:
        raise SystemExit("Missing output filenames in config.yaml for capital_by_ward or financial_return")
    if not council_name or not lobbyist_name or not ward_geojson_name:
        raise SystemExit("Missing output filenames in config.yaml for council_voting, lobbyist_registry, or ward_geojson")
    if not council_summary_name:
        raise SystemExit("Missing output filename in config.yaml for council_summary")
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
    council_summary_path = processed_dir / council_summary_name
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
    council_records, council_start, council_end = load_records_with_year_range(
        council_path, "Council voting", ["meeting_date"]
    )
    lobbyist_records, lobbyist_start, lobbyist_end = load_records_with_year_range(
        lobbyist_path, "Lobbyist registry", ["communication_date", "registration_date"]
    )

    print("Building council summary...")
    council_summary = build_council_summary(council_records, lobbyist_records, recent_days=365)
    with open(council_summary_path, "w", encoding="utf-8") as handle:
        json.dump(council_summary, handle, indent=2)

    # Generate gold summaries (pre-aggregated API responses)
    print("Generating gold summaries...")
    gold_dir = Path(storage.get("gold_dir", "data/gold"))
    gold_dir.mkdir(parents=True, exist_ok=True)

    # Load full datasets for aggregation
    financial_records = load_json_list(financial_path, "Financial return")
    capital_records = load_json_list(capital_json_path, "Capital budget")

    # Get available years for each dataset
    financial_years = sorted({int(r["fiscal_year"]) for r in financial_records if "fiscal_year" in r})
    capital_years = sorted({int(r["fiscal_year"]) for r in capital_records if "fiscal_year" in r})

    # Generate money-flow gold files (one per year)
    money_flow_gold_dir = gold_dir / "money-flow"
    money_flow_gold_dir.mkdir(parents=True, exist_ok=True)
    for year in financial_years:
        print(f"  Generating money-flow summary for {year}...")
        summary = build_money_flow_summary(year, financial_records, financial_years)
        gold_path = money_flow_gold_dir / f"{year}.json"
        with open(gold_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
    money_flow_index_path = money_flow_gold_dir / "index.json"
    money_flow_index = build_gold_index(
        financial_years,
        f"https://storage.googleapis.com/{bucket_name}/gold/money-flow"
    )
    with open(money_flow_index_path, "w", encoding="utf-8") as f:
        json.dump(money_flow_index, f, indent=2)

    # Generate capital gold files (one per year)
    capital_gold_dir = gold_dir / "capital"
    capital_gold_dir.mkdir(parents=True, exist_ok=True)
    for year in capital_years:
        print(f"  Generating capital summary for {year}...")
        summary = build_capital_summary(year, capital_records, capital_years)
        gold_path = capital_gold_dir / f"{year}.json"
        with open(gold_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
    capital_index_path = capital_gold_dir / "index.json"
    capital_index = build_gold_index(
        capital_years,
        f"https://storage.googleapis.com/{bucket_name}/gold/capital"
    )
    with open(capital_index_path, "w", encoding="utf-8") as f:
        json.dump(capital_index, f, indent=2)

    # Move council summary to gold directory (already generated above)
    council_gold_dir = gold_dir / "council-decisions"
    council_gold_dir.mkdir(parents=True, exist_ok=True)
    council_gold_path = council_gold_dir / "summary.json"
    shutil.copy(council_summary_path, council_gold_path)
    print(f"  Copied council summary to gold directory")

    council_summary_dest = get_gcs_path("council_summary", {})
    ward_geojson_dest = get_gcs_path("ward_geojson", {})
    processed_latest_prefix = f"gs://{bucket_name}/processed/latest"
    capital_latest_dest = f"{processed_latest_prefix}/capital_by_ward.json"
    money_flow_latest_dest = f"{processed_latest_prefix}/financial_return.json"
    council_latest_dest = f"{processed_latest_prefix}/council_voting.json"
    lobbyist_latest_dest = f"{processed_latest_prefix}/lobbyist_activity.json"

    print("GCS paths:")
    print(f"  Council Summary: {council_summary_dest}")
    print(f"  Ward GeoJSON: {ward_geojson_dest}")
    print(f"  Processed Latest Prefix: {processed_latest_prefix}")

    if not council_summary_dest or not ward_geojson_dest:
        raise SystemExit("Failed to generate GCS destination paths")

    print("Building ETL run manifest...")
    metadata_dir = Path(storage.get("metadata_dir", processed_dir / "metadata"))
    metadata_dir.mkdir(parents=True, exist_ok=True)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    git_commit = get_git_commit()

    ward_feature_count = None
    try:
        with open(ward_geojson_path, "r", encoding="utf-8") as handle:
            ward_geojson = json.load(handle)
        ward_feature_count = len(ward_geojson.get("features", []))
    except (OSError, json.JSONDecodeError, AttributeError):
        ward_feature_count = None

    manifest = {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_commit,
        "ckan_base_url": ckan_base_url,
        "bucket": bucket_name,
        "sources": {
            "capital_by_ward": {
                "package_id": capital_config.get("package_id"),
            },
            "financial_return": {
                "package_id": financial_config.get("package_id"),
            },
            "council_voting": {
                "package_id": council_config.get("package_id"),
                "resource_id": council_config.get("resource_id"),
            },
            "lobbyist_registry": {
                "package_id": lobbyist_config.get("package_id"),
                "resource_id": lobbyist_config.get("resource_id"),
            },
            "ward_geojson": {
                "package_id": ward_geojson_config.get("package_id"),
                "resource_id": ward_geojson_resource_id,
            },
        },
        "processed": {
            "capital_by_ward": {
                **file_stats(capital_json_path),
                "latest_gcs_path": capital_latest_dest,
                "record_count": len(capital_records),
                "year_start": capital_start,
                "year_end": capital_end,
            },
            "financial_return": {
                **file_stats(financial_path),
                "latest_gcs_path": money_flow_latest_dest,
                "record_count": len(financial_records),
                "year_start": financial_start,
                "year_end": financial_end,
            },
            "council_voting": {
                **file_stats(council_path),
                "latest_gcs_path": council_latest_dest,
                "record_count": len(council_records),
                "year_start": council_start,
                "year_end": council_end,
            },
            "lobbyist_registry": {
                **file_stats(lobbyist_path),
                "latest_gcs_path": lobbyist_latest_dest,
                "record_count": len(lobbyist_records),
                "year_start": lobbyist_start,
                "year_end": lobbyist_end,
            },
            "ward_geojson": {
                **file_stats(ward_geojson_path),
                "gcs_path": ward_geojson_dest,
                "feature_count": ward_feature_count,
            },
        },
        "gold": {
            "money_flow": {
                "index": {
                    **file_stats(money_flow_index_path),
                    "gcs_path": f"gs://{bucket_name}/gold/money-flow/index.json",
                },
                "years": financial_years,
            },
            "capital": {
                "index": {
                    **file_stats(capital_index_path),
                    "gcs_path": f"gs://{bucket_name}/gold/capital/index.json",
                },
                "years": capital_years,
            },
            "council_decisions": {
                **file_stats(council_gold_path),
                "gcs_path": council_summary_dest,
            },
        },
    }

    manifest_path = metadata_dir / f"etl_manifest_{run_id}.json"
    manifest_latest_path = metadata_dir / "etl_manifest_latest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    shutil.copy(manifest_path, manifest_latest_path)
    print(f"  Wrote manifest: {manifest_path}")

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
    ward_geojson_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(ward_geojson_path), ward_geojson_dest]
    money_flow_latest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(financial_path), money_flow_latest_dest]
    capital_latest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(capital_json_path), capital_latest_dest]
    council_latest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(council_path), council_latest_dest]
    lobbyist_latest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(lobbyist_path), lobbyist_latest_dest]

    if cache_control:
        ward_geojson_cmd.extend(["--cache-control", cache_control])
        money_flow_latest_cmd.extend(["--cache-control", cache_control])
        capital_latest_cmd.extend(["--cache-control", cache_control])
        council_latest_cmd.extend(["--cache-control", cache_control])
        lobbyist_latest_cmd.extend(["--cache-control", cache_control])

    run_cmd(ward_geojson_cmd)
    run_cmd(money_flow_latest_cmd)
    run_cmd(capital_latest_cmd)
    run_cmd(council_latest_cmd)
    run_cmd(lobbyist_latest_cmd)

    # Upload gold summaries to GCS
    print("Uploading gold summaries to GCS...")

    # Upload money-flow gold files (one per year)
    for year in financial_years:
        gold_path = gold_dir / "money-flow" / f"{year}.json"
        if gold_path.exists():
            dest = f"gs://{bucket_name}/gold/money-flow/{year}.json"
            cmd = ["gcloud", "--project", project_id, "storage", "cp", str(gold_path), dest]
            if cache_control:
                cmd.extend(["--cache-control", cache_control])
            run_cmd(cmd)
            print(f"  Uploaded {dest}")

    # Upload money-flow gold index
    if money_flow_index_path.exists():
        dest = f"gs://{bucket_name}/gold/money-flow/index.json"
        cmd = ["gcloud", "--project", project_id, "storage", "cp", str(money_flow_index_path), dest]
        if cache_control:
            cmd.extend(["--cache-control", cache_control])
        run_cmd(cmd)
        print(f"  Uploaded {dest}")

    # Upload capital gold files (one per year)
    for year in capital_years:
        gold_path = gold_dir / "capital" / f"{year}.json"
        if gold_path.exists():
            dest = f"gs://{bucket_name}/gold/capital/{year}.json"
            cmd = ["gcloud", "--project", project_id, "storage", "cp", str(gold_path), dest]
            if cache_control:
                cmd.extend(["--cache-control", cache_control])
            run_cmd(cmd)
            print(f"  Uploaded {dest}")

    # Upload capital gold index
    if capital_index_path.exists():
        dest = f"gs://{bucket_name}/gold/capital/index.json"
        cmd = ["gcloud", "--project", project_id, "storage", "cp", str(capital_index_path), dest]
        if cache_control:
            cmd.extend(["--cache-control", cache_control])
        run_cmd(cmd)
        print(f"  Uploaded {dest}")

    # Upload council summary gold file
    if council_gold_path.exists():
        cmd = ["gcloud", "--project", project_id, "storage", "cp", str(council_gold_path), council_summary_dest]
        if cache_control:
            cmd.extend(["--cache-control", cache_control])
        run_cmd(cmd)
        print(f"  Uploaded {council_summary_dest}")

    # Upload ETL run manifest (historical + latest)
    manifest_dest = f"gs://{bucket_name}/metadata/etl_manifest_{run_id}.json"
    manifest_latest_dest = f"gs://{bucket_name}/metadata/etl_manifest_latest.json"
    manifest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(manifest_path), manifest_dest]
    manifest_latest_cmd = ["gcloud", "--project", project_id, "storage", "cp", str(manifest_latest_path), manifest_latest_dest]
    if cache_control:
        manifest_cmd.extend(["--cache-control", cache_control])
        manifest_latest_cmd.extend(["--cache-control", cache_control])
    run_cmd(manifest_cmd)
    run_cmd(manifest_latest_cmd)

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
