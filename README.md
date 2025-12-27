# Toronto Money Flow v0.002

A Next.js dashboard for Toronto procurement, capital investment, money flow, and council decisions. Procurement data is fetched live from CKAN. Budget and governance data is pulled via ETL and served as JSON from gold summaries in GCS (with processed data as fallback).

## Product Spec

- v0.002 scope and acceptance criteria: see `Toronto_Money_Flow_v0.002_Spec.md`

## ETL Flow (Mermaid)

```mermaid
flowchart LR
  subgraph Sources [Toronto Open Data (CKAN)]
    S1[Capital Budget by Ward (XLSX)]
    S2[Financial Return (XLSX)]
    S3[Council Voting (Datastore)]
    S4[Lobbyist Registry (ZIP/XML)]
    S5[Ward Boundaries (GeoJSON)]
  end

  subgraph Schedule [Automation]
    C1[GitHub Actions\nDaily 06:00 UTC]
  end

  subgraph ETL [ETL Pipeline: etl/publish_data_gcs.py]
    E1[Download + Normalize]
    E2[Raw dumps\n(data/raw)]
    E3[Processed datasets\n(data/processed)]
    E4[Gold summaries\n(data/gold)]
    E5[Gold indexes\nindex.json]
    E6[Run manifest\nmetadata/etl_manifest_latest.json]
  end

  subgraph Storage [GCS]
    G1[Processed latest\nprocessed/latest/*]
    G2[Gold\n gold/*]
    G3[Manifest\nmetadata/etl_manifest_latest.json]
  end

  subgraph App [Runtime]
    A1[Next.js API routes]
    A2[UI]
    A1 --> A2
  end

  C1 --> E1
  S1 --> E1
  S2 --> E1
  S3 --> E1
  S4 --> E1
  S5 --> E1
  E1 --> E2
  E1 --> E3
  E3 --> E4
  E4 --> E5
  E1 --> E6
  E3 --> G1
  E4 --> G2
  E6 --> G3
  G2 --> A1
  G1 --> A1
```

## What it does

Analyzes Toronto city spending and governance across four lenses:

### 1. Procurement Contracts (real-time)
Fetches contract data from [Toronto Bids Awarded Contracts](https://open.toronto.ca/dataset/tobids-awarded-contracts/) and [Non-Competitive Contracts](https://open.toronto.ca/dataset/tobids-non-competitive-contracts/):

- Total contract values (competitive and non-competitive)
- Vendor concentration metrics (Top 1 and Top 10 vendor shares)
- Non-competitive share (percentage of total spend and contracts)
- Top vendors (top 10 vendors by awarded amount)
- Division breakdown (top 8 divisions by spend)
- Category breakdown (top 10 procurement categories)
- Median award size (typical contract value)
- Governance health indicators (with thresholds)

### 2. Capital Investment by Ward (ETL)
Analyzes [Capital Budget by Ward](https://open.toronto.ca/dataset/budget-capital-budget-plan-by-ward-10-yr-approved/) to show geographic distribution:

- Total capital investment (planned infrastructure and projects)
- City-wide vs ward-specific split
- Top 5 and bottom 5 wards comparison
- Ward disparity ratio (top vs bottom ward)
- Ward map visualization (choropleth)
- Investment categories (top 5 categories by spend)
- Largest projects with ward and program details
- Progressive disclosure toggle for categories and projects

### 3. Money Flow (Revenue vs Spending) (ETL)
Summarizes how money comes in and goes out of the city budget:

- Revenue vs expenditure totals
- Top and bottom 7 funding sources
- Top and bottom 7 spending categories
- Surplus or deficit balance

### 4. Council Decisions (Governance) (ETL)
Tracks recent council activity and lobbying context:

- Recent motions and outcomes (passed/failed)
- Decision categories (transportation, housing, environment, etc.)
- Councillor participation (votes cast and absences)
- Lobbying activity summary (top subjects, communications count)

## Data Tiers

The project uses a three-tier data architecture optimized for performance and cost:

### Gold Tier (Pre-aggregated Summaries)
- **Purpose**: Pre-computed API responses ready for UI consumption
- **Location**: `data/gold/` locally, `gs://{bucket}/gold/` in GCS
- **Size**: 4-14KB per file (99% smaller than processed files)
- **Format**: One JSON file per year for money-flow and capital; single file for council decisions
- **Index**: `gold/money-flow/index.json` and `gold/capital/index.json` list available years and per-year URLs
- **Generation**: Created during ETL by `publish_data_gcs.py`
- **Benefits**:
  - Eliminates runtime aggregation (faster API responses)
  - Avoids Next.js cache limits (no 2MB overflow errors)
  - Reduces bandwidth costs (smaller file transfers)

### Processed Tier (Full Normalized Datasets)
- **Purpose**: Complete datasets used as fallback if gold tier unavailable
- **Location**: `data/processed/` locally, `gs://{bucket}/{dataset}/` in GCS
- **Size**: 50KB - 71MB per file
- **Format**: One JSON file per dataset (all years combined)
- **Usage**: APIs load these only if gold files missing, then aggregate at runtime

### Raw Tier (ETL Intermediates)
- **Purpose**: Temporary files during ETL processing
- **Location**: `data/raw/` locally only (not uploaded to GCS)
- **Lifecycle**: Ephemeral, recreated on each ETL run

**API Behavior**: APIs read gold indexes to determine available years, fetch gold summaries when possible, and fall back to processed data if gold is missing.

## Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

Then open http://localhost:3000

## Project Structure

```
toronto-money-flow/
├── app/
│   ├── layout.js
│   ├── page.js
│   └── api/
│       ├── _lib/
│       │   └── load-json.js
│       ├── metric/
│       │   └── route.js
│       ├── capital-by-ward/
│       │   └── route.js
│       ├── money-flow/
│       │   └── route.js
│       ├── council-decisions/
│       │   └── route.js
│       └── ward-map/
│           └── route.js
├── etl/
│   ├── config.yaml
│   ├── config_loader.py
│   ├── capital_by_ward_etl.py
│   ├── financial_return_etl.py
│   ├── council_voting_etl.py
│   ├── lobbyist_registry_etl.py
│   ├── publish_data_gcs.py
│   ├── requirements.txt
│   └── README.md
├── scripts/
│   └── publish_data_gcs.sh
├── data/
│   ├── gold/
│   ├── raw/
│   └── processed/
├── package.json
└── next.config.js
```

## How it works

### Data Pipeline

The project uses an automated ETL pipeline that runs daily:

**ETL outputs (see `etl/README.md` for details):**
1. Capital Budget by Ward -> `capital_by_ward.json` (and `capital_by_ward.csv`)
2. Financial Return (revenue and expenses) -> `financial_return.json`
3. Council Voting Records -> `council_voting.json`
4. Lobbyist Registry Activity -> `lobbyist_activity.json`
5. Ward Boundaries (GeoJSON) -> `ward_boundaries.geojson`
6. ETL run manifest -> `data/processed/metadata/etl_manifest_latest.json`

**Gold outputs (API-ready summaries):**
1. Money Flow summaries -> `data/gold/money-flow/{year}.json`
2. Capital summaries -> `data/gold/capital/{year}.json`
3. Council Decisions summary -> `data/gold/council-decisions/summary.json`
4. Gold indexes -> `data/gold/money-flow/index.json`, `data/gold/capital/index.json`

**Automation:**
- All ETL scripts are orchestrated by `etl/publish_data_gcs.py`
- `scripts/publish_data_gcs.sh` runs the orchestrator via `uv`
- GitHub Actions runs the publish step daily (6 AM UTC)
- Configuration is centralized in `etl/config.yaml`

### API Layer

**Procurement contracts (live CKAN):**
- `/api/metric` fetches data directly from CKAN datastore resources
- Aggregates totals, concentration metrics, and top groups

**Capital investment (ETL-based):**
- `/api/capital-by-ward` reads the gold index from `GCS_BASE_URL` (or `CAPITAL_GOLD_INDEX_URL` override) and loads the per-year gold file
- Falls back to `capital_by_ward.json` (GCS via `CAPITAL_DATA_URL` override) if gold is missing
- Returns totals, top/bottom wards, category breakdown, and top projects

**Money flow (ETL-based):**
- `/api/money-flow` reads the gold index from `GCS_BASE_URL` (or `MONEY_FLOW_GOLD_INDEX_URL` override) and loads the per-year gold file
- Falls back to `financial_return.json` (GCS via `FINANCIAL_RETURN_URL` override) if gold is missing
- Returns top and bottom 7 revenue and expenditure groups plus balance

**Council decisions (ETL-based):**
- `/api/council-decisions` reads the gold summary from `GCS_BASE_URL` (or `COUNCIL_SUMMARY_URL` override)
- Falls back to `council_voting.json` and `lobbyist_activity.json` if the summary is missing

**Ward map (ETL-based):**
- `/api/ward-map` reads `ward_boundaries.geojson` from `GCS_BASE_URL` (or `WARD_GEOJSON_URL` override)
- Merges ward geometry with capital investment totals

## Deployment

### App environment variables (runtime)

Required:
- `GCS_BASE_URL` (example: `https://storage.googleapis.com/standardize-journalism-data`)

Optional overrides (rare):
- `MONEY_FLOW_GOLD_INDEX_URL`
- `CAPITAL_GOLD_INDEX_URL`
- `COUNCIL_SUMMARY_URL`
- `CAPITAL_DATA_URL`
- `FINANCIAL_RETURN_URL`
- `VOTING_DATA_URL`
- `LOBBYIST_DATA_URL`
- `WARD_GEOJSON_URL`

### Automated ETL (GitHub Actions)

The repository includes automated ETL via `.github/workflows/etl-pipeline.yml`:

**Setup (one-time):**
1. Configure GitHub Secrets:
   - `GCP_PROJECT_ID`
   - `GCS_BUCKET_NAME`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT`
2. Configure GCP Workload Identity

**Runs automatically:**
- Daily at 6 AM UTC (1 AM EST)
- Manual trigger via workflow_dispatch

### Manual publish to GCS

```bash
chmod +x scripts/publish_data_gcs.sh
CREATE_BUCKET=0 MAKE_PUBLIC=0 ./scripts/publish_data_gcs.sh
```

**GCS paths**:
- Council Summary (gold): `gs://{bucket}/gold/council-decisions/summary.json`
- Ward Boundaries: `gs://{bucket}/ward-boundaries/ward_boundaries.geojson`
- Processed Latest (stable fallback):
  - `gs://{bucket}/processed/latest/capital_by_ward.json`
  - `gs://{bucket}/processed/latest/financial_return.json`
  - `gs://{bucket}/processed/latest/council_voting.json`
  - `gs://{bucket}/processed/latest/lobbyist_activity.json`
- Gold Money Flow: `gs://{bucket}/gold/money-flow/{year}.json`
- Gold Money Flow Index: `gs://{bucket}/gold/money-flow/index.json`
- Gold Capital: `gs://{bucket}/gold/capital/{year}.json`
- Gold Capital Index: `gs://{bucket}/gold/capital/index.json`
- ETL Manifest (latest): `gs://{bucket}/metadata/etl_manifest_latest.json`

### External data hosting

If hosting JSON externally (GCS or CDN), set the base URL:

```
GCS_BASE_URL=https://your-host
```

Optional overrides (only if you need to point a specific dataset elsewhere):

```
MONEY_FLOW_GOLD_INDEX_URL=https://your-host/gold/money-flow/index.json
CAPITAL_GOLD_INDEX_URL=https://your-host/gold/capital/index.json
COUNCIL_SUMMARY_URL=https://your-host/gold/council-decisions/summary.json
CAPITAL_DATA_URL=https://your-host/processed/latest/capital_by_ward.json
FINANCIAL_RETURN_URL=https://your-host/processed/latest/financial_return.json
VOTING_DATA_URL=https://your-host/processed/latest/council_voting.json
LOBBYIST_DATA_URL=https://your-host/processed/latest/lobbyist_activity.json
WARD_GEOJSON_URL=https://your-host/ward-boundaries/ward_boundaries.geojson
```

When gold URLs are set, APIs read the index/summary first and only fall back to processed data if gold is missing.

## Data Sources

All data is sourced from [Toronto Open Data](https://open.toronto.ca/):

**ETL Pipeline:**
- Capital Budget by Ward (XLSX)
- Financial Information Return (Schedules 10 and 40) (XLSX)
- Council Voting Records (Datastore API)
- Lobbyist Registry Activity (ZIP/XML)
- Ward Boundaries (GeoJSON)

**Real-time API:**
- Awarded Contracts (Datastore API)
- Non-Competitive Contracts (Datastore API)

CKAN Base URL: `https://ckan0.cf.opendata.inter.prod-toronto.ca`

## v0.002 Features (Current)

**Procurement governance:**
- Vendor concentration metrics (Top 1, Top 10 share)
- Non-competitive contract share (amount and count)
- Category and division breakdowns
- Median award size calculation
- Governance health indicators and caveats

**Capital investment by ward:**
- ETL pipeline for XLSX normalization
- City-wide vs ward-specific analysis
- Top 5 / bottom 5 ward comparison
- Ward disparity ratio
- Ward map visualization
- Category and project detail toggle

**Money flow:**
- Revenue vs spending totals
- Top and bottom funding sources
- Surplus or deficit balance

**Council decisions:**
- Recent motions and outcomes
- Decision category breakdown
- Councillor participation summary
- Lobbyist activity summary

**General:**
- Year selector (recent years; data availability varies by section)
- External data URLs supported via environment variables

## Next Steps (v0.003)

**High priority:**
- Operating budget by program ETL
- Operating vs capital comparison
- Year-over-year trends for operating spend

**Medium priority:**
- Per-capita ward investment (requires population data)
- Deeper ward map interactions (click to highlight/lock)
- Time-series charts for capital investment

**Low priority:**
- Export to CSV
- Additional UI filters and drill-down

## ETL (Capital Budget by Ward)

See `etl/README.md` for the ETL pipeline details.
