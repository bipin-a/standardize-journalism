# Toronto Open Data ETL Pipeline

This directory contains ETL scripts that download, parse, and normalize datasets from Toronto Open Data for the Toronto Money Flow project.

## Overview

The ETL pipeline processes five active datasets:

| Dataset | Script | Output | Update Frequency |
|---------|--------|--------|------------------|
| Capital Budget by Ward | `capital_by_ward_etl.py` | `capital_by_ward.csv` + `capital_by_ward.json` | Annual (as published) |
| Financial Return (Revenue/Expenses) | `financial_return_etl.py` | `financial_return.json` | Annual (as published) |
| Council Voting Records | `council_voting_etl.py` | `council_voting.json` | Weekly (as minutes are published) |
| Lobbyist Registry Activity | `lobbyist_registry_etl.py` | `lobbyist_activity.json` | Daily (as published) |
| Council Decisions Summary | `publish_data_gcs.py` | `gold/council-decisions/summary.json` | Daily (derived) |
| Ward Boundaries (GeoJSON) | `publish_data_gcs.py` | `ward_boundaries.geojson` | As needed |
| ETL Run Manifest | `publish_data_gcs.py` | `metadata/etl_manifest_latest.json` | Daily (derived) |

All scripts:
- Pull data from Toronto Open Data CKAN
- Are configured via `config.yaml`
- Output normalized JSON to `data/processed/` (full datasets)
- Generate pre-aggregated summaries to `data/gold/` (API-ready responses)
- Run automatically via GitHub Actions (daily at 6 AM UTC)

## Configuration

Dataset metadata is centralized in `config.yaml`:

```yaml
datasets:
  capital_by_ward:
    package_id: budget-capital-budget-plan-by-ward-10-yr-approved
    output_filename: capital_by_ward.csv
    json_output_filename: capital_by_ward.json
    gcs_path_template: processed/latest/capital_by_ward.json

  financial_return:
    package_id: 734d5877-f4de-4322-9851-882d22e1a11f
    output_filename: financial_return.json
    gcs_path_template: processed/latest/financial_return.json

  council_voting:
    package_id: 7f5232d6-0d2a-4f95-864a-417cbf341cc4
    resource_id: 55ead013-2331-4686-9895-9e8145b94189
    output_filename: council_voting.json
    gcs_path_template: processed/latest/council_voting.json

  lobbyist_registry:
    package_id: 6a87b8bf-f4df-4762-b5dc-bf393336687b
    resource_id: 94c1fe59-7247-4b92-b213-950f71e04aff
    output_filename: lobbyist_activity.json
    gcs_path_template: processed/latest/lobbyist_activity.json

  ward_geojson:
    package_id: 5e7a8234-f805-43ac-820f-03d7c360b588
    resource_id: 737b29e0-8329-4260-b6af-21555ab24f28
    output_filename: ward_boundaries.geojson
    gcs_path_template: ward-boundaries/ward_boundaries.geojson

ckan:
  base_url: https://ckan0.cf.opendata.inter.prod-toronto.ca
  timeout: 30
  download_timeout: 60
```

To update a dataset ID, edit `config.yaml` rather than modifying code.

## Setup

```bash
# Create virtual environment
uv venv
source .venv/bin/activate  # or .venv\\Scripts\\activate on Windows

# Install dependencies
uv pip install -r etl/requirements.txt
```

Dependencies:
- pandas - Data manipulation
- openpyxl - Excel file parsing
- requests - HTTP requests to CKAN API
- pyyaml - Configuration loading

## Usage

### Manual Runs

Each ETL can be run independently:

```bash
# Capital budget by ward (XLSX download + parsing)
uv run --with-requirements etl/requirements.txt -- \
  python etl/capital_by_ward_etl.py \
  --output data/processed/capital_by_ward.csv \
  --json-output data/processed/capital_by_ward.json

# Financial return (revenue + expenses, multiple XLSX resources)
uv run --with-requirements etl/requirements.txt -- \
  python etl/financial_return_etl.py \
  --output data/processed/financial_return.json

# Council voting (datastore API with pagination)
uv run --with-requirements etl/requirements.txt -- \
  python etl/council_voting_etl.py \
  --output data/processed/council_voting.json

# Lobbyist registry (ZIP download with XML parsing)
uv run --with-requirements etl/requirements.txt -- \
  python etl/lobbyist_registry_etl.py \
  --output data/processed/lobbyist_activity.json

# Generate gold summaries from existing processed files
uv run --with-requirements etl/requirements.txt -- \
  python etl/generate_gold.py
```

### Gold File Generation

After processed files exist, generate pre-aggregated API summaries:

```bash
# Generate all gold summaries (from existing processed files)
uv run --with-requirements etl/requirements.txt -- python etl/generate_gold.py
```

This creates:
- `data/gold/money-flow/{year}.json` - One file per fiscal year (~4KB each)
- `data/gold/money-flow/index.json` - Available years + per-year URLs
- `data/gold/capital/{year}.json` - One file per fiscal year (~9KB each)
- `data/gold/capital/index.json` - Available years + per-year URLs
- `data/gold/council-decisions/summary.json` - Rolling 365-day summary (~14KB)

**When to run**: After ETL scripts complete, or manually when testing API response shapes locally.

**How it works**: Re-implements API aggregation logic in Python to match exact response shapes from `/api/money-flow`, `/api/capital-by-ward`, and `/api/council-decisions`.

### Command-Line Overrides

All scripts support CLI overrides (config provides defaults):

```bash
# Override package ID
python etl/capital_by_ward_etl.py --package-id custom-package-id

# Override base year for 10-year plan data
python etl/capital_by_ward_etl.py --base-year 2025

# Filter to specific fiscal years
python etl/financial_return_etl.py --fiscal-years 2024 2023 2022

# Filter to recent months
python etl/council_voting_etl.py --recent-months 6
python etl/lobbyist_registry_etl.py --recent-months 6

# Override timeouts
python etl/financial_return_etl.py --ckan-timeout 60 --download-timeout 120
```

### Automated Runs (GitHub Actions)

The pipeline runs automatically via `.github/workflows/etl-pipeline.yml`:

- Schedule: Daily at 6 AM UTC (1 AM EST)
- Trigger: Manual workflow dispatch is enabled
- Process:
  1. Runs ETL scripts
  2. Downloads ward boundaries
  3. Builds dynamic GCS paths from data year ranges
  4. Uploads JSON to Google Cloud Storage

GCS Path Structure:
- Processed Latest: `gs://bucket/processed/latest/{capital_by_ward,financial_return,council_voting,lobbyist_activity}.json`
- Council Summary: `gs://bucket/gold/council-decisions/summary.json`
- Ward Boundaries: `gs://bucket/ward-boundaries/ward_boundaries.geojson`
- Gold Money Flow: `gs://bucket/gold/money-flow/{year}.json`
- Gold Money Flow Index: `gs://bucket/gold/money-flow/index.json`
- Gold Capital: `gs://bucket/gold/capital/{year}.json`
- Gold Capital Index: `gs://bucket/gold/capital/index.json`
- ETL Manifest (latest): `gs://bucket/metadata/etl_manifest_latest.json`

Paths are extracted dynamically from the data (no hardcoded years).

## ETL Script Details

### 1. capital_by_ward_etl.py

Source: Capital Budget and Plan by Ward (10-Year Approved)
Format: XLSX file with ward-level project budgets

Output schema:
```json
[
  {
    "fiscal_year": 2024,
    "ward_number": 11,
    "ward_name": "University-Rosedale",
    "amount": 42300000,
    "year_offset": 1,
    "program_name": "Water Infrastructure",
    "project_name": "Watermain Replacement",
    "category": "State of Good Repair",
    "source_file": "capital-budget-2024.xlsx",
    "source_url": "https://...",
    "ingested_at": "2024-12-26T10:30:00Z"
  }
]
```

Notes:
- Auto-detects year columns (Year 1-10 or actual years like 2024-2033)
- Converts $000s into dollars
- Ward number 0 represents city-wide projects

### 2. financial_return_etl.py

Source: Financial Information Return (Schedules 10 and 40)
Format: Multiple XLSX files (one per year)

Output schema:
```json
[
  {
    "fiscal_year": 2024,
    "flow_type": "revenue",
    "label": "Taxation - Property",
    "line_description": "Taxation - Property (PIL)",
    "amount": 5200000000,
    "source_files": ["fir-2024.xlsx"],
    "source_resource_ids": ["abc123"],
    "source_resource_names": ["FIR 2024"],
    "source_package_id": "734d5877-f4de-4322-9851-882d22e1a11f",
    "ingested_at": "2024-12-26T10:30:00Z"
  }
]
```

Notes:
- Aggregates duplicate labels across multiple resources
- Validates detected columns have non-empty data
- Handles negative amounts (parentheses notation)

### 3. council_voting_etl.py

Source: City Council Voting Records
Format: CKAN datastore API

Output schema (one record per motion):
```json
[
  {
    "meeting_date": "2024-11-15",
    "motion_id": "CC24.15",
    "motion_title": "Traffic Calming Implementation",
    "motion_category": "transportation",
    "vote_outcome": "passed",
    "yes_votes": 20,
    "no_votes": 5,
    "absent_votes": 0,
    "vote_margin": 15,
    "votes": [
      {
        "councillor_name": "Jane Doe",
        "vote": "Yes"
      }
    ],
    "source_resource_id": "55ead013...",
    "ingested_at": "2024-12-26T10:30:00Z"
  }
]
```

Notes:
- Pagination handles datasets > 100K records
- Auto-categorizes motions based on title keywords
- Individual votes are included when councillor names are available

### 4. lobbyist_registry_etl.py

Source: Lobbyist Registry Activity
Format: ZIP file containing XML

Output schema:
```json
[
  {
    "registration_date": "2024-10-01",
    "lobbyist_name": "John Doe",
    "lobbyist_type": "Consultant",
    "client_name": "ABC Corporation",
    "subject_matter": "Rezoning for mixed-use development",
    "subject_category": "housing_development",
    "communication_date": "2024-11-15",
    "public_office_holder": "Jane Smith, Councillor",
    "source_resource_id": "94c1fe59...",
    "ingested_at": "2024-12-26T10:30:00Z"
  }
]
```

Notes:
- Uses resource_show URL directly (no hardcoded filename)
- Parses XML activity records into normalized rows
- Categories are assigned using keyword matching

## Data Quality Notes

The ETL scripts include basic fail-fast checks:
- CKAN API responses must be successful
- Required columns must be detected for XLSX parsing
- Empty outputs raise errors
- Year extraction must succeed for capital and financial data

There is no full schema validation beyond these checks.

## Publishing to GCS

The `scripts/publish_data_gcs.sh` wrapper runs `etl/publish_data_gcs.py`, which:

1. Runs all ETL scripts
2. Downloads ward boundaries GeoJSON
3. Builds a council decisions summary JSON
4. Extracts year ranges from outputs
5. Uploads JSON to Google Cloud Storage

Manual run:
```bash
chmod +x scripts/publish_data_gcs.sh
CREATE_BUCKET=0 MAKE_PUBLIC=0 ./scripts/publish_data_gcs.sh
```

## Troubleshooting

### "No fiscal years found in data"

The ETL extracted data but could not find any `fiscal_year` values. Check:
- Excel column headers match expected patterns (Year 1-10 or 2024-2033)
- Resource name contains year range (e.g., "2024-2033")
- Provide `--base-year` explicitly

### "Could not detect column"

Column detection failed. Check:
- Excel schema changes in the source file
- `--sheet-name` override to use the correct sheet

### "No records parsed from any resources"

No data was extracted. Check:
- Package ID is correct in config.yaml
- XLSX resources exist in the package
- `--fiscal-years` filter is not too restrictive

## Development

Adding a new ETL:

1. Create `etl/new_dataset_etl.py`
2. Add config entry to `config.yaml`
3. Use `get_dataset_config("new_dataset")`
4. Add upload logic to `etl/publish_data_gcs.py` if it should be published

## License

Data: Open Government Licence - Toronto
Code: See repository LICENSE
