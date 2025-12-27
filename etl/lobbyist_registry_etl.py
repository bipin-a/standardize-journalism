#!/usr/bin/env python3
import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

# Add parent directory to path to import config_loader
sys.path.insert(0, str(Path(__file__).parent))
from config_loader import get_dataset_config, load_config

# Subject matter category keywords
SUBJECT_KEYWORDS = {
    "housing_development": ["zoning", "development", "building", "housing", "permit", "construction", "real estate", "property"],
    "transportation": ["transit", "ttc", "road", "bike", "lane", "traffic", "subway", "bus", "transportation"],
    "environment": ["climate", "park", "green", "tree", "environment", "sustainability", "waste", "recycling", "energy"],
    "budget_finance": ["tax", "budget", "funding", "levy", "finance", "revenue", "grant", "procurement"],
    "public_safety": ["police", "fire", "emergency", "safety", "security"],
    "social_services": ["community", "support", "service", "social", "childcare", "seniors", "health"],
    "governance": ["council", "procedure", "ethics", "transparency", "committee", "governance", "regulation"]
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


def download_zip_resource(package_id, resource_id, output_dir, base_url, timeout, download_timeout):
    """Download ZIP resource using CKAN resource metadata URL"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Fetch resource metadata and use URL directly
    resource_meta = ckan_call(f"resource_show?id={resource_id}", base_url, timeout)
    download_url = resource_meta.get("url")

    if not download_url:
        # Fallback: try constructing CKAN download URL
        download_url = f"{base_url}/dataset/{package_id}/resource/{resource_id}/download"
        print(f"Warning: No URL in resource metadata, using fallback: {download_url}")

    print(f"Downloading from {download_url}")

    # Download ZIP file
    response = requests.get(download_url, stream=True, timeout=download_timeout)
    response.raise_for_status()

    # Extract filename from Content-Disposition or URL
    filename = "lobbyactivity.zip"
    if "Content-Disposition" in response.headers:
        match = re.search(r'filename="?([^"]+)"?', response.headers["Content-Disposition"])
        if match:
            filename = match.group(1)
    else:
        filename = Path(download_url.split("?")[0]).name or "lobbyactivity.zip"

    zip_path = output_dir / filename
    with open(zip_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)

    return zip_path


def extract_and_parse(zip_path, output_dir):
    """Extract ZIP and parse relevant data files"""
    extract_dir = output_dir / "lobbyactivity_extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)

    # Extract ZIP
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    print(f"Extracted to {extract_dir}")

    # List extracted files
    extracted_files = list(extract_dir.glob("**/*"))
    print(f"Extracted files: {[f.name for f in extracted_files if f.is_file()]}")

    # Find XML activity files
    activity_files = []
    for f in extracted_files:
        if f.is_file() and f.suffix.lower() == '.xml':
            if "activity" in f.name.lower():
                activity_files.append(f)

    if not activity_files:
        # Try any XML file
        activity_files = [f for f in extracted_files if f.is_file() and f.suffix.lower() == '.xml']

    if not activity_files:
        raise RuntimeError(f"No XML files found in ZIP. Extracted: {[f.name for f in extracted_files if f.is_file()]}")

    print(f"Using activity files: {[f.name for f in activity_files]}")

    # Parse XML files and extract records
    records = []
    for file_path in activity_files:
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()

            # Each ROW contains a subject matter (SM)
            for row in root.findall(".//ROW"):
                sm = row.find(".//SM")
                if sm is None:
                    continue

                # Extract base subject matter info
                sm_number = sm.findtext("SMNumber", "")
                status = sm.findtext("Status", "")
                lobbyist_type = sm.findtext("Type", "")
                subject_matter = sm.findtext("Particulars", "")
                subject_categories = sm.findtext("SubjectMatter", "")
                effective_date = sm.findtext("EffectiveDate", "")

                # Extract registrant info
                registrant = sm.find(".//Registrant")
                lobbyist_name = ""
                if registrant is not None:
                    first = registrant.findtext("FirstName", "")
                    last = registrant.findtext("LastName", "")
                    lobbyist_name = f"{first} {last}".strip()

                # Extract firm/client info
                firm = sm.find(".//Firm")
                client_name = ""
                if firm is not None:
                    client_name = firm.findtext("Name", "")

                # Extract communications
                communications = sm.find(".//Communications")
                if communications is not None and len(communications) > 0:
                    for comm in communications.findall(".//Communication"):
                        poh_name = comm.findtext("POH_Name", "")
                        comm_date = comm.findtext("CommunicationDate", "")

                        # Only include if there's actual communication data
                        if poh_name or comm_date:
                            records.append({
                                "sm_number": sm_number,
                                "status": status,
                                "lobbyist_type": lobbyist_type,
                                "lobbyist_name": lobbyist_name,
                                "client_name": client_name,
                                "subject_matter": subject_matter,
                                "subject_categories": subject_categories,
                                "registration_date": effective_date,
                                "communication_date": comm_date,
                                "public_office_holder": poh_name
                            })
                else:
                    # No communications, but still create a record for the registration
                    records.append({
                        "sm_number": sm_number,
                        "status": status,
                        "lobbyist_type": lobbyist_type,
                        "lobbyist_name": lobbyist_name,
                        "client_name": client_name,
                        "subject_matter": subject_matter,
                        "subject_categories": subject_categories,
                        "registration_date": effective_date,
                        "communication_date": None,
                        "public_office_holder": None
                    })

            print(f"Parsed {file_path.name}: {len(records)} records extracted")

        except Exception as e:
            print(f"Warning: Could not parse {file_path.name}: {e}")
            continue

    if not records:
        raise RuntimeError("Could not extract any records from XML files")

    # Convert to DataFrame
    df = pd.DataFrame(records)
    return df


def categorize_subject_matter(subject_text):
    """Categorize subject matter based on keywords"""
    if not subject_text or pd.isna(subject_text):
        return "other"

    text_lower = str(subject_text).lower()

    # Count keyword matches for each category
    scores = {}
    for category, keywords in SUBJECT_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in text_lower)
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
        dt = pd.to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except:
        return None


def build_column_map(columns):
    """Build column mapping - simplified for XML-parsed data"""
    # XML parsing already gives us standardized column names
    col_map = {}

    for col in columns:
        col_lower = col.lower().strip()

        # Map XML-specific columns
        if col_lower == "lobbyist_name":
            col_map["lobbyist_name"] = col
        elif col_lower == "lobbyist_type":
            col_map["lobbyist_type"] = col
        elif col_lower == "client_name":
            col_map["client_name"] = col
        elif col_lower == "subject_matter":
            col_map["subject_matter"] = col
        elif col_lower == "communication_date":
            col_map["communication_date"] = col
        elif col_lower == "registration_date":
            col_map["registration_date"] = col
        elif col_lower == "public_office_holder":
            col_map["public_office_holder"] = col

    return col_map


def filter_recent_months(df, date_col, months=6):
    """Filter DataFrame to include only records from recent months"""
    if date_col not in df.columns:
        return df

    cutoff_date = datetime.now() - timedelta(days=months * 30)
    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
    df_filtered = df[df[date_col] >= cutoff_date]

    return df_filtered


def run_etl(args):
    """Main ETL process"""
    raw_dir = Path(args.raw_dir)

    # Download ZIP file
    print(f"Downloading lobbyist registry ZIP from resource {args.resource_id}...")
    zip_path = download_zip_resource(
        args.package_id,
        args.resource_id,
        raw_dir,
        args.ckan_base_url,
        args.ckan_timeout,
        args.download_timeout
    )

    # Extract and parse
    df = extract_and_parse(zip_path, raw_dir)
    print(f"Loaded {len(df)} lobbyist activity records")

    # Build column mapping
    col_map = build_column_map(df.columns)
    print(f"Column mapping: {col_map}")

    if not col_map:
        print(f"Warning: No columns mapped. Available columns: {list(df.columns)}")
        # For MVP, we'll create minimal records if we can at least identify some columns

    # Filter to recent months if requested and date column available
    if args.recent_months and col_map.get("communication_date"):
        df = filter_recent_months(df, col_map["communication_date"], args.recent_months)
        print(f"Filtered to {len(df)} records from last {args.recent_months} months")
    elif args.recent_months and col_map.get("registration_date"):
        df = filter_recent_months(df, col_map["registration_date"], args.recent_months)
        print(f"Filtered to {len(df)} records from last {args.recent_months} months")

    # Build records
    records = []
    ingested_at = datetime.now(timezone.utc).isoformat()

    for _, row in df.iterrows():
        # Extract fields
        lobbyist_name = str(row.get(col_map.get("lobbyist_name", ""), "")).strip() if col_map.get("lobbyist_name") else None
        lobbyist_type = str(row.get(col_map.get("lobbyist_type", ""), "")).strip() if col_map.get("lobbyist_type") else None
        client_name = str(row.get(col_map.get("client_name", ""), "")).strip() if col_map.get("client_name") else None
        subject_matter = str(row.get(col_map.get("subject_matter", ""), "")).strip() if col_map.get("subject_matter") else None
        public_office_holder = str(row.get(col_map.get("public_office_holder", ""), "")).strip() if col_map.get("public_office_holder") else None

        # Skip rows with no meaningful data
        if not lobbyist_name or lobbyist_name == "nan":
            continue

        # Parse dates
        registration_date = None
        if col_map.get("registration_date"):
            registration_date = parse_date(row.get(col_map["registration_date"]))

        communication_date = None
        if col_map.get("communication_date"):
            communication_date = parse_date(row.get(col_map["communication_date"]))

        # Categorize subject matter
        subject_category = categorize_subject_matter(subject_matter)

        records.append({
            "registration_date": registration_date,
            "lobbyist_name": lobbyist_name if lobbyist_name != "nan" else None,
            "lobbyist_type": lobbyist_type if lobbyist_type and lobbyist_type != "nan" else None,
            "client_name": client_name if client_name and client_name != "nan" else None,
            "subject_matter": subject_matter if subject_matter and subject_matter != "nan" else None,
            "subject_category": subject_category,
            "communication_date": communication_date,
            "public_office_holder": public_office_holder if public_office_holder and public_office_holder != "nan" else None,
            "source_resource_id": args.resource_id,
            "ingested_at": ingested_at
        })

    # Sort by most recent communication/registration date
    def get_sort_key(record):
        return record.get("communication_date") or record.get("registration_date") or ""

    records.sort(key=get_sort_key, reverse=True)

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)

    # Print summary
    category_counts = {}
    for record in records:
        cat = record["subject_category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    lobbyist_types = {}
    for record in records:
        ltype = record.get("lobbyist_type") or "unknown"
        lobbyist_types[ltype] = lobbyist_types.get(ltype, 0) + 1

    print(json.dumps({
        "records_written": len(records),
        "output_file": str(output_path),
        "categories": category_counts,
        "lobbyist_types": lobbyist_types,
        "date_range": {
            "earliest": records[-1].get("communication_date") or records[-1].get("registration_date") if records else None,
            "latest": records[0].get("communication_date") or records[0].get("registration_date") if records else None
        }
    }, indent=2))


def main():
    # Load configuration
    config = get_dataset_config("lobbyist_registry")
    global_config = load_config()

    parser = argparse.ArgumentParser(description="ETL for Lobbyist Registry Activity")
    parser.add_argument("--package-id", default=config["package_id"])
    parser.add_argument("--resource-id", default=config.get("resource_id"))
    parser.add_argument("--raw-dir", default=config["raw_dir"])
    parser.add_argument("--output", default=f"{config['processed_dir']}/{config['output_filename']}")
    parser.add_argument("--ckan-base-url", default=config["ckan_base_url"])
    parser.add_argument("--ckan-timeout", type=int, default=config["ckan_timeout"])
    parser.add_argument("--download-timeout", type=int, default=config["ckan_download_timeout"])
    parser.add_argument("--recent-months", type=int, help="Only include activity from recent N months")

    args = parser.parse_args()
    run_etl(args)


if __name__ == "__main__":
    main()
