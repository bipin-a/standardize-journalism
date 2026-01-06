# Toronto Open Data ETL Pipeline

This directory contains ETL scripts that download, parse, and normalize datasets from Toronto Open Data for the Toronto Money Flow project.

## Overview

The ETL pipeline processes five active datasets:

| Dataset | Script | Output | Update Frequency |
|---------|--------|--------|------------------|
| Capital Budget by Ward | `capital_by_ward_etl.py` | `capital_by_ward.csv` + `capital_by_ward.json` | Annual (as published) |
| Financial Return (Revenue/Expenses) | `financial_return_etl.py` | `financial_return.json` | Annual (as published) |
| Operating Budget Summary | `operating_budget_etl.py` | `operating_budget.json` | Annual (as published) |
| Council Voting Records | `council_voting_etl.py` | `council_voting.json` | Weekly (as minutes are published) |
| Lobbyist Registry Activity | `lobbyist_registry_etl.py` | `lobbyist_activity.json` | Daily (as published) |
| Council Decisions Summary | `publish_data_gcs.py` | `gold/council-decisions/summary.json`, `gold/council-decisions/{year}.json`, `gold/council-decisions/index.json`, `gold/council-decisions/trends.json` | Daily (derived) |
| Ward Boundaries (GeoJSON) | `publish_data_gcs.py` | `ward_boundaries.geojson` | As needed |
| ETL Run Manifest | `publish_data_gcs.py` | `metadata/etl_manifest_latest.json` | Daily (derived) |

All scripts:
- Pull data from Toronto Open Data CKAN
- Are configured via `config.yaml`
- Output normalized JSON to `data/processed/` (full datasets and per-year splits)
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

### Unified Runner (recommended)

Use the bash script to run the ETL pipeline with uv (the supported path):

```bash
# Ingest only: processed tier + upload
./scripts/publish_data_gcs.sh ingest

# Gold only: derived summaries + upload
./scripts/publish_data_gcs.sh gold

# End-to-end: ingest + gold + uploads
./scripts/publish_data_gcs.sh all
```

Environment flags:
- `CREATE_BUCKET=1` create the bucket if missing
- `MAKE_PUBLIC=1` grant public read access

Direct calls to individual ETL scripts are intentionally undocumented to keep a single, consistent workflow.

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
- Processed Capital by Year: `gs://bucket/processed/capital-by-ward/{year}.json`
- Processed Money Flow by Year: `gs://bucket/processed/financial-return/{year}.json`
- Processed Council by Year: `gs://bucket/processed/council-voting/{year}.json`
- Processed Lobbyist by Year: `gs://bucket/processed/lobbyist-registry/{year}.json`
- Council Summary: `gs://bucket/gold/council-decisions/summary.json`
- Council Decisions by Year: `gs://bucket/gold/council-decisions/{year}.json`
- Council Decisions Index: `gs://bucket/gold/council-decisions/index.json`
- Council Decisions Trends: `gs://bucket/gold/council-decisions/trends.json`
- Ward Boundaries: `gs://bucket/ward-boundaries/ward_boundaries.geojson`
- Gold Money Flow: `gs://bucket/gold/money-flow/{year}.json`
- Gold Money Flow Index: `gs://bucket/gold/money-flow/index.json`
- Gold Capital: `gs://bucket/gold/capital/{year}.json`
- Gold Capital Index: `gs://bucket/gold/capital/index.json`
- Gold RAG Index: `gs://bucket/gold/rag/index.json`
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

Use the unified runner (single supported entrypoint):

1. `ingest` runs ETL + uploads processed data
2. `gold` builds summaries + uploads gold data
3. `all` runs end-to-end (ingest + gold + uploads)

Manual run:
```bash
chmod +x scripts/publish_data_gcs.sh
CREATE_BUCKET=0 MAKE_PUBLIC=0 ./scripts/publish_data_gcs.sh all
```

## Troubleshooting

### "No fiscal years found in data"

The ETL extracted data but could not find any `fiscal_year` values. Check:
- Excel column headers match expected patterns (Year 1-10 or 2024-2033)
- Resource name contains year range (e.g., "2024-2033")
- Update the parser or dataset source if the year range format changed

### "Could not detect column"

Column detection failed. Check:
- Excel schema changes in the source file
- Sheet names match expected patterns in the source file

### "No records parsed from any resources"

No data was extracted. Check:
- Package ID is correct in config.yaml
- XLSX resources exist in the package

## Development

Adding a new ETL:

1. Create `etl/new_dataset_etl.py`
2. Add config entry to `config.yaml`
3. Use `get_dataset_config("new_dataset")`
4. Add upload logic to `etl/publish_data_gcs.py` if it should be published

## License

Data: Open Government Licence - Toronto
Code: See repository LICENSE
