# Toronto Money Flow
## Technical Project Plan (Current Implementation)

Version: 1.1  
Date: December 2025  
Audience: Technical project managers and maintainers

---

## 1. Executive Summary

Toronto Money Flow is a transparency dashboard that answers:
- Where does the city's money come from?
- Where does it go?
- Who is getting contracts?
- How are decisions being made?

The current implementation is intentionally simple and avoids over-engineering:
- Next.js frontend and API routes
- Live CKAN fetches for procurement
- ETL outputs as JSON for budget and governance datasets
- Optional Google Cloud Storage for hosting processed data

---

## 2. Current System Architecture

### 2.1 Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Next.js App Router + React | Single-page dashboard in `app/page.js` |
| API | Next.js Route Handlers | `/app/api/*` endpoints |
| Visuals | Native HTML/CSS/SVG | No chart libraries |
| Data (live) | CKAN datastore APIs | Procurement contracts |
| Data (ETL) | JSON files | Capital, money flow, council voting, lobbyist registry, ward geojson |
| Storage | Local files or GCS | Controlled via env vars |
| Automation | GitHub Actions | Runs ETL daily |

### 2.2 Data Flow

```
Toronto Open Data (CKAN)
  ├─ Live API -> /api/metric -> UI
  └─ ETL (Python) -> data/processed/*.json -> GCS (optional) -> /api/* -> UI
```

---

## 3. Active Data Sources

Configured in `etl/config.yaml`:

| Dataset | Package / Resource | Output |
|---------|--------------------|--------|
| Capital Budget by Ward | budget-capital-budget-plan-by-ward-10-yr-approved | `capital_by_ward.json` |
| Financial Information Return | 734d5877-f4de-4322-9851-882d22e1a11f | `financial_return.json` |
| Council Voting Records | 7f5232d6-0d2a-4f95-864a-417cbf341cc4 | `council_voting.json` |
| Lobbyist Registry Activity | 6a87b8bf-f4df-4762-b5dc-bf393336687b | `lobbyist_activity.json` |
| Ward Boundaries GeoJSON | 5e7a8234-f805-43ac-820f-03d7c360b588 | `ward_boundaries.geojson` |

Procurement datasets are read live via CKAN in `/api/metric`.

---

## 4. API Endpoints (Current)

| Endpoint | Purpose | Data Source |
|----------|---------|-------------|
| `/api/metric` | Procurement totals, concentration, categories | CKAN live |
| `/api/capital-by-ward` | Ward totals, top/bottom, categories, projects | ETL JSON |
| `/api/money-flow` | Revenue and expenditure breakdowns | ETL JSON |
| `/api/council-decisions` | Motion outcomes, categories, participation | ETL JSON |
| `/api/ward-map` | Ward GeoJSON enriched with investment totals | ETL JSON |

---

## 5. Operations and Automation

### 5.1 ETL Orchestration

`etl/publish_data_gcs.py` runs all ETL scripts and uploads outputs to GCS.
It also builds a small council summary JSON for the UI.

Wrapper:
```
scripts/publish_data_gcs.sh
```

### 5.2 Automation

GitHub Actions workflow: `.github/workflows/etl-pipeline.yml`
- Runs daily at 6 AM UTC
- Uses Workload Identity for GCS uploads
- Generates dynamic GCS paths based on year ranges in the data

### 5.3 Environment Variables (App)

The app reads external data from URLs when these are set:
- `CAPITAL_DATA_URL`
- `FINANCIAL_RETURN_URL`
- `COUNCIL_SUMMARY_URL`
- `VOTING_DATA_URL`
- `LOBBYIST_DATA_URL`
- `WARD_GEOJSON_URL`

If not set, the app reads from `data/processed`.

---

## 6. Known Constraints (Current)

- Council decisions are filtered by recent days, not fiscal year
- Year selector offers recent years, but some datasets are annual or multi-year
- No per-capita calculations (population data not yet integrated)
- No database; all ETL outputs are JSON files

---

## 7. Future Enhancements (Optional)

These are intentionally deferred to avoid over-engineering:
- Operating budget ETL and program-level analysis
- Per-capita ward investment (requires population data)
- Trend charts over time for capital and money flow
- More interactive ward map (click-to-lock, labels)

---

Document version: 1.1
