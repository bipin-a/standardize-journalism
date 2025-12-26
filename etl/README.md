# ETL: Capital Budget by Ward (Q1D)

This script downloads the latest "Capital Budget & Plan by Ward" XLSX from Toronto Open Data,
normalizes it, and emits a long-format CSV suitable for ward-level rollups.

## Dataset

- Package ID: `budget-capital-budget-plan-by-ward-10-yr-approved`
- Source: Toronto Open Data CKAN (XLSX resources, not datastore-active)

The sheet typically includes:
`Ward Number`, `Ward`, `Year 1`..`Year 10`, plus project metadata.
Amounts are in thousands of dollars and are converted to dollars in the output.

## Setup

```bash
uv venv
source .venv/bin/activate
uv pip install -r etl/requirements.txt
```

## Run

```bash
python3 etl/capital_by_ward_etl.py
```

Common overrides:

```bash
python3 etl/capital_by_ward_etl.py \
  --resource-id 6b774b3a-5e1a-4362-ba31-a3b07fce31db \
  --base-year 2024 \
  --output data/processed/capital_by_ward.csv \
  --json-output data/processed/capital_by_ward.json
```

## Output

The CSV is long-format with one row per ward/year:

- `fiscal_year`
- `ward_number`
- `ward_name`
- `amount` (dollars)
- `year_offset` (1..10)
- `source_file`
- `source_url`
- `ingested_at`

## Notes

- If the resource name does not include a year range, pass `--base-year`.
- Use `--allow-details` if the latest resource is named "details" but still contains ward columns.
