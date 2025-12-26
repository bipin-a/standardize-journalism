# Toronto Money Flow v0.002

A procurement transparency dashboard showing live contract data from Toronto Open Data, with governance health indicators.

## Product Spec

- v0.002 scope and acceptance criteria: see `Toronto_Money_Flow_v0.002_Spec.md`

## What it does

Analyzes Toronto city spending through two lenses:

### 1. Procurement Contracts
Fetches contract data from [Toronto Bids Awarded Contracts](https://open.toronto.ca/dataset/tobids-awarded-contracts/) and [Non-Competitive Contracts](https://open.toronto.ca/dataset/tobids-non-competitive-contracts/):

- **Total contract values** (competitive and non-competitive)
- **Vendor concentration metrics** (Top 1 and Top 10 vendor shares)
- **Non-competitive share** (percentage of total spend and contracts)
- **Top vendors** (top 10 vendors by awarded amount)
- **Division breakdown** (top 8 divisions by spend)
- **Category breakdown** (top 10 procurement categories)
- **Median award size** (typical contract value)
- **Governance health indicators** (with color-coded warnings)

### 2. Capital Investment by Ward
Analyzes [Capital Budget by Ward](https://open.toronto.ca/dataset/budget-capital-budget-plan-by-ward-10-yr-approved/) to show geographic distribution:

- **Total capital investment** (planned infrastructure and projects)
- **City Wide vs Ward-Specific** split (reveals that 93% is city-wide)
- **Top 5 and Bottom 5 wards** comparison
- **Ward disparity metrics** (10,000x difference between top and bottom)
- **Investment categories** (State of Good Repair, Growth, Service Improvement)
- **Largest projects** with ward and program details
- **Progressive disclosure** (click to see categories and projects)

## Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
toronto-money-flow/
├── app/
│   ├── layout.js                    # Root layout
│   ├── page.js                      # Main UI dashboard
│   └── api/
│       ├── metric/
│       │   └── route.js             # Procurement contracts API
│       └── capital-by-ward/
│           └── route.js             # Capital budget by ward API
├── etl/
│   ├── capital_by_ward_etl.py       # ETL for capital budget XLSX
│   ├── requirements.txt
│   └── README.md
├── data/
│   ├── raw/                         # Downloaded XLSX files
│   └── processed/                   # Normalized CSV/JSON output
├── package.json
└── next.config.js
```

## How it works

### Procurement Contracts (Real-time API)
1. Frontend calls `/api/metric?year=2024`
2. API fetches from Toronto Open Data CKAN API (live data)
3. Aggregates contract values, vendor concentration, categories
4. Returns JSON with governance metrics

### Capital Investment (ETL + API)
1. ETL downloads XLSX from Toronto Open Data (run: `python3 etl/capital_by_ward_etl.py`)
2. Normalizes and enriches data (adds City Wide handling, filters zeros)
3. Outputs to `data/processed/capital_by_ward.json`
4. Frontend calls `/api/capital-by-ward?year=2024`
5. API reads processed JSON and aggregates by ward
6. Returns top/bottom wards, categories, disparity metrics

### Money Flow (Revenue + Expenses)
1. ETL downloads the Financial Information Return XLSX (run: `python3 etl/financial_return_etl.py`)
2. Parses revenue + expense line items into `data/processed/financial_return.json`
3. Frontend calls `/api/money-flow?year=2024`
4. API reads the processed JSON and returns top/bottom groups and balance

## Deployment with External Data Hosting

If you plan to host processed JSON externally, set these environment variables:

```
CAPITAL_DATA_URL=https://your-host/capital_by_ward.json
FINANCIAL_RETURN_URL=https://your-host/financial_return.json
```

When these are set, the API routes fetch data from the URLs and fall back to local `data/processed` only if the env vars are missing.

### Google Cloud Storage Example

Bucket layout:

- `gs://standardize-journalism-data/money-flow/2024/financial_return.json`
- `gs://standardize-journalism-data/capital/2020-2029/capital_by_ward.json`

Commands:

```
# Generate JSON
python3 etl/capital_by_ward_etl.py --json-output data/processed/capital_by_ward.json
python3 etl/financial_return_etl.py --output data/processed/financial_return.json --raw-dir data/raw

# Create bucket
gcloud config set project standardize-journalism
gcloud storage buckets create gs://standardize-journalism-data --location=us-central1 --uniform-bucket-level-access

# Upload
gcloud storage cp data/processed/financial_return.json \
  gs://standardize-journalism-data/money-flow/2024/financial_return.json \
  --cache-control="public, max-age=3600"
gcloud storage cp data/processed/capital_by_ward.json \
  gs://standardize-journalism-data/capital/2020-2029/capital_by_ward.json \
  --cache-control="public, max-age=3600"

# Make bucket public
gcloud storage buckets add-iam-policy-binding gs://standardize-journalism-data \
  --member=allUsers --role=roles/storage.objectViewer
```

Deployment env vars:

```
CAPITAL_DATA_URL=https://storage.googleapis.com/standardize-journalism-data/capital/2020-2029/capital_by_ward.json
FINANCIAL_RETURN_URL=https://storage.googleapis.com/standardize-journalism-data/money-flow/2024/financial_return.json
```

## Data Source

- **Datasets**: Toronto Bids Awarded Contracts, Toronto Bids Non-Competitive Contracts
- **API**: CKAN Datastore API
- **Endpoint**: `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search`
- **Resource ID**: `e211f003-5909-4bea-bd96-d75899d8e612`

## v0.002+ Features (Completed)

**Procurement Governance:**
- [x] Vendor concentration metrics (Top 1, Top 10 share)
- [x] Non-competitive contract share (amount and count)
- [x] Category/commodity type breakdown
- [x] Median award size calculation
- [x] Governance health indicators
- [x] Comprehensive caveats section

**Capital Investment by Ward (Q1D):**
- [x] ETL pipeline for XLSX data normalization
- [x] City Wide vs Ward-Specific analysis
- [x] Top 5 / Bottom 5 ward comparison
- [x] Ward disparity metrics (10,000x ratio)
- [x] Investment by category (Growth, State of Good Repair, etc.)
- [x] Project-level detail (top 10 largest projects)
- [x] Progressive disclosure UI (hide/show details)

**General:**
- [x] Year selector (2020-2029 for capital, 2022-2024 for contracts)

## Next Steps (v0.003)

**High Priority (Q1B - Operating Budget):**
- [ ] Operating budget by program ETL (similar to capital by ward)
- [ ] Operating vs Capital comparison (where does money go?)
- [ ] Year-over-year trends for operating spend

**Medium Priority (Q2 - ROI & Outcomes):**
- [ ] Service outcome datasets integration
- [ ] Cost per outcome calculations
- [ ] Infrastructure condition tracking

**Low Priority (UX Enhancements):**
- [ ] Per-capita ward investment (requires population data)
- [ ] Ward map visualization
- [ ] Monthly trend charts for contracts
- [ ] Interactive filtering and drill-down
- [ ] Export to CSV functionality

## ETL (Capital Budget by Ward)

See `etl/README.md` for the first ETL pipeline that downloads the XLSX
and outputs a normalized ward/year table.
