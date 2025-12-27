# Toronto Money Flow v0.002

A Next.js dashboard for Toronto procurement, capital investment, money flow, and council decisions. Procurement data is fetched live from CKAN. Budget and governance data is pulled via ETL and served as JSON from local files or Google Cloud Storage.

## Product Spec

- v0.002 scope and acceptance criteria: see `Toronto_Money_Flow_v0.002_Spec.md`

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
- `/api/capital-by-ward` reads `capital_by_ward.json` (GCS if `CAPITAL_DATA_URL` is set)
- Returns totals, top/bottom wards, category breakdown, and top projects

**Money flow (ETL-based):**
- `/api/money-flow` reads `financial_return.json` (GCS if `FINANCIAL_RETURN_URL` is set)
- Returns top and bottom 7 revenue and expenditure groups plus balance

**Council decisions (ETL-based):**
- `/api/council-decisions` reads `council_voting.json` and `lobbyist_activity.json`
- Aggregates recent motions, decision categories, participation, and lobbying summary

**Ward map (ETL-based):**
- `/api/ward-map` reads `ward_boundaries.geojson` (GCS if `WARD_GEOJSON_URL` is set)
- Merges ward geometry with capital investment totals

## Deployment

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

**GCS paths are dynamic** (extracted from data):
- Capital: `gs://{bucket}/capital/{year_start}-{year_end}/capital_by_ward.json`
- Money Flow: `gs://{bucket}/money-flow/{year_start}-{year_end}/financial_return.json`
- Council Voting: `gs://{bucket}/council-voting/{year_start}-{year_end}/council_voting.json`
- Lobbyist Registry: `gs://{bucket}/lobbyist-registry/{year_start}-{year_end}/lobbyist_activity.json`
- Ward Boundaries: `gs://{bucket}/ward-boundaries/ward_boundaries.geojson`

### External data hosting

If hosting processed JSON externally, set these environment variables:

```
CAPITAL_DATA_URL=https://your-host/capital/2024-2033/capital_by_ward.json
FINANCIAL_RETURN_URL=https://your-host/money-flow/2020-2024/financial_return.json
VOTING_DATA_URL=https://your-host/council-voting/2022-2025/council_voting.json
LOBBYIST_DATA_URL=https://your-host/lobbyist-registry/2022-2025/lobbyist_activity.json
WARD_GEOJSON_URL=https://your-host/ward-boundaries/ward_boundaries.geojson
```

When these are set, API routes fetch from the URLs and fall back to local `data/processed` when unset.

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
