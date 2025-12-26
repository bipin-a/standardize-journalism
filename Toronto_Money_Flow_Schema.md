# Toronto Money Flow
## Database Schema & Data Model

**Version:** 1.0  
**Date:** December 2025

---

## 1. Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TORONTO MONEY FLOW - ERD                               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   fiscal_year    │       │   revenue_source │       │  revenue_entry   │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ PK year_id       │       │ PK source_id     │       │ PK entry_id      │
│    year_label    │◀──────│    category      │◀──────│ FK year_id       │
│    start_date    │       │    subcategory   │       │ FK source_id     │
│    end_date      │       │    description   │       │    amount        │
│    mayor_name    │       └──────────────────┘       │    notes         │
│    is_current    │                                  └──────────────────┘
└──────────────────┘
        │
        │
        ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      ward        │       │     program      │       │ operating_budget │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ PK ward_id       │       │ PK program_id    │       │ PK budget_id     │
│    ward_number   │       │    program_name  │◀──────│ FK year_id       │
│    ward_name     │       │    division      │       │ FK program_id    │
│    councillor    │       │    service       │       │    category      │
│    population    │       │    activity      │       │    amount        │
│    geometry      │       │    parent_id     │       │    budget_type   │
└──────────────────┘       └──────────────────┘       └──────────────────┘
        │
        │
        ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ capital_project  │       │    contract      │       │     vendor       │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ PK project_id    │       │ PK contract_id   │       │ PK vendor_id     │
│ FK ward_id       │       │ FK project_id    │◀──────│    vendor_name   │
│ FK program_id    │──────▶│ FK vendor_id     │       │    address       │
│    project_name  │       │ FK year_id       │       │    city          │
│    subproject    │       │    doc_number    │       │    country       │
│    category      │       │    rfx_type      │       │    total_awarded │
│    year_1_budget │       │    awarded_amt   │       └──────────────────┘
│    year_2_budget │       │    award_date    │
│    ...           │       │    division      │
│    total_10_year │       │    description   │
└──────────────────┘       │    category      │
                           └──────────────────┘

┌──────────────────┐
│ dev_charge_fund  │       ┌──────────────────┐
├──────────────────┤       │ dev_charge_entry │
│ PK fund_id       │       ├──────────────────┤
│    fund_name     │◀──────│ PK entry_id      │
│    description   │       │ FK fund_id       │
└──────────────────┘       │ FK year_id       │
                           │    month         │
                           │    amount        │
                           └──────────────────┘
```

---

## 2. Table Definitions

### 2.1 Core Reference Tables

#### `fiscal_year`
Fiscal year reference for time-based analysis and administration comparison.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `year_id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `year_label` | VARCHAR(10) | NOT NULL, UNIQUE | e.g., "2024" |
| `start_date` | DATE | NOT NULL | Fiscal year start (Jan 1) |
| `end_date` | DATE | NOT NULL | Fiscal year end (Dec 31) |
| `mayor_name` | VARCHAR(100) | | Mayor during this year |
| `mayor_term_start` | DATE | | Term start date |
| `is_current` | BOOLEAN | DEFAULT FALSE | Current fiscal year flag |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation |
| `updated_at` | TIMESTAMP | | Last update |

```sql
CREATE TABLE fiscal_year (
    year_id SERIAL PRIMARY KEY,
    year_label VARCHAR(10) NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    mayor_name VARCHAR(100),
    mayor_term_start DATE,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Sample data
INSERT INTO fiscal_year (year_label, start_date, end_date, mayor_name, mayor_term_start) VALUES
('2024', '2024-01-01', '2024-12-31', 'Olivia Chow', '2023-07-12'),
('2023', '2023-01-01', '2023-12-31', 'Olivia Chow', '2023-07-12'),
('2022', '2022-01-01', '2022-12-31', 'John Tory', '2014-12-01'),
('2021', '2021-01-01', '2021-12-31', 'John Tory', '2014-12-01');
```

#### `ward`
Toronto's 25 municipal wards with geographic boundaries.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ward_id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `ward_number` | INTEGER | NOT NULL, UNIQUE | 1-25 |
| `ward_name` | VARCHAR(100) | NOT NULL | e.g., "Etobicoke North" |
| `councillor_name` | VARCHAR(100) | | Current councillor |
| `councillor_email` | VARCHAR(100) | | Contact email |
| `population_2021` | INTEGER | | Census population |
| `area_sq_km` | DECIMAL(10,2) | | Geographic area |
| `geometry` | GEOMETRY(MultiPolygon, 4326) | | GeoJSON boundary |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | | |

```sql
CREATE TABLE ward (
    ward_id SERIAL PRIMARY KEY,
    ward_number INTEGER NOT NULL UNIQUE,
    ward_name VARCHAR(100) NOT NULL,
    councillor_name VARCHAR(100),
    councillor_email VARCHAR(100),
    population_2021 INTEGER,
    area_sq_km DECIMAL(10,2),
    geometry GEOMETRY(MultiPolygon, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_ward_geometry ON ward USING GIST(geometry);
```

---

### 2.2 Revenue Tables (Sources)

#### `revenue_source`
Categories of municipal revenue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `source_id` | SERIAL | PRIMARY KEY | |
| `category` | VARCHAR(50) | NOT NULL | Top-level: Taxation, Grants, Fees |
| `subcategory` | VARCHAR(100) | | e.g., "Provincial - Conditional" |
| `source_name` | VARCHAR(200) | NOT NULL | Full name |
| `description` | TEXT | | Explanation of source |
| `is_intergovernmental` | BOOLEAN | DEFAULT FALSE | Provincial/Federal flag |
| `parent_id` | INTEGER | FK → revenue_source | For hierarchical categories |

```sql
CREATE TABLE revenue_source (
    source_id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(100),
    source_name VARCHAR(200) NOT NULL,
    description TEXT,
    is_intergovernmental BOOLEAN DEFAULT FALSE,
    parent_id INTEGER REFERENCES revenue_source(source_id)
);

-- Sample hierarchy
INSERT INTO revenue_source (category, subcategory, source_name, is_intergovernmental) VALUES
('Taxation', 'Property', 'Residential Property Tax', FALSE),
('Taxation', 'Property', 'Commercial Property Tax', FALSE),
('Taxation', 'Property', 'Industrial Property Tax', FALSE),
('Grants', 'Provincial - Unconditional', 'Ontario Municipal Partnership Fund', TRUE),
('Grants', 'Provincial - Conditional', 'Transit Operating Subsidy', TRUE),
('Grants', 'Provincial - Conditional', 'Social Housing Funding', TRUE),
('Grants', 'Federal', 'Canada Community-Building Fund', TRUE),
('Grants', 'Federal', 'Housing Accelerator Fund', TRUE),
('User Fees', 'Transit', 'TTC Fare Revenue', FALSE),
('User Fees', 'Recreation', 'Program Fees', FALSE),
('Development Charges', 'Transit', 'Transit DC Reserve', FALSE),
('Development Charges', 'Water', 'Water DC Reserve', FALSE),
('Other', 'Investment', 'Investment Income', FALSE);
```

#### `revenue_entry`
Annual revenue amounts by source.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `entry_id` | SERIAL | PRIMARY KEY | |
| `year_id` | INTEGER | FK → fiscal_year, NOT NULL | |
| `source_id` | INTEGER | FK → revenue_source, NOT NULL | |
| `amount` | BIGINT | NOT NULL | Amount in dollars |
| `amount_budget` | BIGINT | | Budgeted amount |
| `amount_actual` | BIGINT | | Actual collected |
| `notes` | TEXT | | |
| `data_source` | VARCHAR(100) | | e.g., "Schedule 10" |

```sql
CREATE TABLE revenue_entry (
    entry_id SERIAL PRIMARY KEY,
    year_id INTEGER NOT NULL REFERENCES fiscal_year(year_id),
    source_id INTEGER NOT NULL REFERENCES revenue_source(source_id),
    amount BIGINT NOT NULL,
    amount_budget BIGINT,
    amount_actual BIGINT,
    notes TEXT,
    data_source VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(year_id, source_id)
);

CREATE INDEX idx_revenue_year ON revenue_entry(year_id);
CREATE INDEX idx_revenue_source ON revenue_entry(source_id);
```

---

### 2.3 Expense Tables (Uses)

#### `program`
City programs/divisions for operating budget categorization.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `program_id` | SERIAL | PRIMARY KEY | |
| `program_name` | VARCHAR(200) | NOT NULL | e.g., "Toronto Transit Commission" |
| `division` | VARCHAR(200) | | Parent division |
| `service` | VARCHAR(200) | | Service offering |
| `activity` | VARCHAR(200) | | Specific activity |
| `functional_area` | VARCHAR(100) | | Schedule 40 category |
| `parent_id` | INTEGER | FK → program | Hierarchy support |

```sql
CREATE TABLE program (
    program_id SERIAL PRIMARY KEY,
    program_name VARCHAR(200) NOT NULL,
    division VARCHAR(200),
    service VARCHAR(200),
    activity VARCHAR(200),
    functional_area VARCHAR(100),
    parent_id INTEGER REFERENCES program(program_id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sample programs
INSERT INTO program (program_name, division, functional_area) VALUES
('Toronto Transit Commission', 'TTC', 'Transportation'),
('Toronto Police Service', 'Police', 'Protection'),
('Toronto Fire Services', 'Fire', 'Protection'),
('Shelter, Support & Housing', 'SSHA', 'Social & Family'),
('Parks, Forestry & Recreation', 'PFR', 'Recreation & Culture'),
('Transportation Services', 'Trans', 'Transportation'),
('Toronto Water', 'Water', 'Environmental'),
('Solid Waste Management', 'SWM', 'Environmental');
```

#### `operating_budget`
Annual operating budget by program and expense category.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `budget_id` | SERIAL | PRIMARY KEY | |
| `year_id` | INTEGER | FK → fiscal_year, NOT NULL | |
| `program_id` | INTEGER | FK → program, NOT NULL | |
| `expense_category` | VARCHAR(100) | | Salaries, Materials, etc. |
| `expense_subcategory` | VARCHAR(100) | | |
| `budget_type` | VARCHAR(20) | | 'Approved' or 'Recommended' |
| `amount` | BIGINT | NOT NULL | Amount in dollars |
| `is_expense` | BOOLEAN | DEFAULT TRUE | TRUE=expense, FALSE=revenue |

```sql
CREATE TABLE operating_budget (
    budget_id SERIAL PRIMARY KEY,
    year_id INTEGER NOT NULL REFERENCES fiscal_year(year_id),
    program_id INTEGER NOT NULL REFERENCES program(program_id),
    expense_category VARCHAR(100),
    expense_subcategory VARCHAR(100),
    budget_type VARCHAR(20) DEFAULT 'Approved',
    amount BIGINT NOT NULL,
    is_expense BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_opbudget_year ON operating_budget(year_id);
CREATE INDEX idx_opbudget_program ON operating_budget(program_id);
```

#### `capital_project`
10-year capital budget projects by ward.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `project_id` | SERIAL | PRIMARY KEY | |
| `ward_id` | INTEGER | FK → ward | NULL for city-wide |
| `program_id` | INTEGER | FK → program | |
| `project_name` | VARCHAR(300) | NOT NULL | |
| `subproject_name` | VARCHAR(300) | | |
| `category` | VARCHAR(100) | | e.g., "State of Good Repair" |
| `base_year` | INTEGER | NOT NULL | Starting year of 10-yr plan |
| `year_1` | BIGINT | | Budget year 1 (dollars) |
| `year_2` | BIGINT | | Budget year 2 |
| `year_3` | BIGINT | | Budget year 3 |
| `year_4` | BIGINT | | Budget year 4 |
| `year_5` | BIGINT | | Budget year 5 |
| `year_6` | BIGINT | | Budget year 6 |
| `year_7` | BIGINT | | Budget year 7 |
| `year_8` | BIGINT | | Budget year 8 |
| `year_9` | BIGINT | | Budget year 9 |
| `year_10` | BIGINT | | Budget year 10 |
| `total_10_year` | BIGINT | | Sum of all years |
| `geometry` | GEOMETRY(Point, 4326) | | Project location if known |

```sql
CREATE TABLE capital_project (
    project_id SERIAL PRIMARY KEY,
    ward_id INTEGER REFERENCES ward(ward_id),
    program_id INTEGER REFERENCES program(program_id),
    project_name VARCHAR(300) NOT NULL,
    subproject_name VARCHAR(300),
    category VARCHAR(100),
    base_year INTEGER NOT NULL,
    year_1 BIGINT DEFAULT 0,
    year_2 BIGINT DEFAULT 0,
    year_3 BIGINT DEFAULT 0,
    year_4 BIGINT DEFAULT 0,
    year_5 BIGINT DEFAULT 0,
    year_6 BIGINT DEFAULT 0,
    year_7 BIGINT DEFAULT 0,
    year_8 BIGINT DEFAULT 0,
    year_9 BIGINT DEFAULT 0,
    year_10 BIGINT DEFAULT 0,
    total_10_year BIGINT GENERATED ALWAYS AS (
        COALESCE(year_1,0) + COALESCE(year_2,0) + COALESCE(year_3,0) + 
        COALESCE(year_4,0) + COALESCE(year_5,0) + COALESCE(year_6,0) + 
        COALESCE(year_7,0) + COALESCE(year_8,0) + COALESCE(year_9,0) + 
        COALESCE(year_10,0)
    ) STORED,
    geometry GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_capproject_ward ON capital_project(ward_id);
CREATE INDEX idx_capproject_program ON capital_project(program_id);
CREATE INDEX idx_capproject_year ON capital_project(base_year);
```

---

### 2.4 Contract & Vendor Tables

#### `vendor`
Companies receiving city contracts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `vendor_id` | SERIAL | PRIMARY KEY | |
| `vendor_name` | VARCHAR(300) | NOT NULL | |
| `vendor_name_normalized` | VARCHAR(300) | | Cleaned for matching |
| `address` | VARCHAR(500) | | Full address |
| `city` | VARCHAR(100) | | |
| `province_state` | VARCHAR(100) | | |
| `country` | VARCHAR(100) | DEFAULT 'Canada' | |
| `postal_code` | VARCHAR(20) | | |
| `is_local` | BOOLEAN | | Toronto-based vendor |
| `total_awarded_all_time` | BIGINT | | Computed field |

```sql
CREATE TABLE vendor (
    vendor_id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(300) NOT NULL,
    vendor_name_normalized VARCHAR(300),
    address VARCHAR(500),
    city VARCHAR(100),
    province_state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Canada',
    postal_code VARCHAR(20),
    is_local BOOLEAN,
    total_awarded_all_time BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_vendor_name ON vendor(vendor_name_normalized);
```

#### `contract`
Awarded contracts linking vendors to projects/divisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `contract_id` | SERIAL | PRIMARY KEY | |
| `external_id` | VARCHAR(100) | UNIQUE | Toronto Bids unique_id |
| `doc_number` | VARCHAR(50) | | e.g., "Doc4053424337" |
| `vendor_id` | INTEGER | FK → vendor, NOT NULL | |
| `project_id` | INTEGER | FK → capital_project | Link if matched |
| `year_id` | INTEGER | FK → fiscal_year | |
| `rfx_type` | VARCHAR(20) | | RFQ, RFP, RFT, NRFP |
| `category` | VARCHAR(100) | | Construction, Goods, Services |
| `division` | VARCHAR(200) | | Requesting division |
| `description` | TEXT | | Full description |
| `awarded_amount` | BIGINT | NOT NULL | Amount in dollars |
| `award_date` | DATE | | |
| `buyer_name` | VARCHAR(100) | | City buyer contact |
| `buyer_email` | VARCHAR(100) | | |
| `status` | VARCHAR(50) | DEFAULT 'Awarded' | Awarded, Cancelled |

```sql
CREATE TABLE contract (
    contract_id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,
    doc_number VARCHAR(50),
    vendor_id INTEGER NOT NULL REFERENCES vendor(vendor_id),
    project_id INTEGER REFERENCES capital_project(project_id),
    year_id INTEGER REFERENCES fiscal_year(year_id),
    rfx_type VARCHAR(20),
    category VARCHAR(100),
    division VARCHAR(200),
    description TEXT,
    awarded_amount BIGINT NOT NULL,
    award_date DATE,
    buyer_name VARCHAR(100),
    buyer_email VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Awarded',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_contract_vendor ON contract(vendor_id);
CREATE INDEX idx_contract_date ON contract(award_date);
CREATE INDEX idx_contract_division ON contract(division);
CREATE INDEX idx_contract_category ON contract(category);
```

---

### 2.5 Development Charges Tables

#### `dev_charge_fund`
Reserve funds for development charges.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `fund_id` | SERIAL | PRIMARY KEY | |
| `fund_name` | VARCHAR(100) | NOT NULL, UNIQUE | e.g., "Transit" |
| `description` | TEXT | | |

```sql
CREATE TABLE dev_charge_fund (
    fund_id SERIAL PRIMARY KEY,
    fund_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

INSERT INTO dev_charge_fund (fund_name, description) VALUES
('Transit', 'Public transit infrastructure'),
('Water', 'Water system improvements'),
('Sanitary Sewer', 'Wastewater infrastructure'),
('Storm Water', 'Stormwater management'),
('Parks & Recreation', 'Parks and recreation facilities'),
('Library', 'Toronto Public Library'),
('Subsidized Housing', 'Affordable housing development'),
('Fire', 'Fire services infrastructure'),
('Paramedic', 'Paramedic services');
```

#### `dev_charge_entry`
Monthly development charge revenue by fund.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `entry_id` | SERIAL | PRIMARY KEY | |
| `fund_id` | INTEGER | FK → dev_charge_fund, NOT NULL | |
| `year_id` | INTEGER | FK → fiscal_year, NOT NULL | |
| `month` | INTEGER | 1-12 | Accounting month |
| `amount` | BIGINT | NOT NULL | Dollars |
| `is_residential` | BOOLEAN | | Residential vs non-residential |

```sql
CREATE TABLE dev_charge_entry (
    entry_id SERIAL PRIMARY KEY,
    fund_id INTEGER NOT NULL REFERENCES dev_charge_fund(fund_id),
    year_id INTEGER NOT NULL REFERENCES fiscal_year(year_id),
    month INTEGER CHECK (month BETWEEN 1 AND 12),
    amount BIGINT NOT NULL,
    is_residential BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dc_fund ON dev_charge_entry(fund_id);
CREATE INDEX idx_dc_year ON dev_charge_entry(year_id);
```

---

## 3. Materialized Views

### 3.1 Ward Investment Summary

Pre-computed ward-level investment totals for fast map rendering.

```sql
CREATE MATERIALIZED VIEW mv_ward_investment AS
SELECT 
    w.ward_id,
    w.ward_number,
    w.ward_name,
    w.population_2021,
    cp.base_year,
    COUNT(cp.project_id) AS project_count,
    SUM(cp.total_10_year) AS total_investment,
    SUM(cp.year_1) AS current_year_budget,
    CASE 
        WHEN w.population_2021 > 0 
        THEN SUM(cp.total_10_year)::DECIMAL / w.population_2021 
        ELSE 0 
    END AS investment_per_capita
FROM ward w
LEFT JOIN capital_project cp ON w.ward_id = cp.ward_id
GROUP BY w.ward_id, w.ward_number, w.ward_name, w.population_2021, cp.base_year;

CREATE UNIQUE INDEX idx_mv_ward_inv ON mv_ward_investment(ward_id, base_year);

-- Refresh command (run after data updates)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ward_investment;
```

### 3.2 Vendor Summary

Top vendors by total awarded amount.

```sql
CREATE MATERIALIZED VIEW mv_vendor_summary AS
SELECT 
    v.vendor_id,
    v.vendor_name,
    v.city,
    v.country,
    v.is_local,
    COUNT(c.contract_id) AS contract_count,
    SUM(c.awarded_amount) AS total_awarded,
    MIN(c.award_date) AS first_contract,
    MAX(c.award_date) AS last_contract,
    ARRAY_AGG(DISTINCT c.category) AS categories,
    ARRAY_AGG(DISTINCT c.division) AS divisions
FROM vendor v
JOIN contract c ON v.vendor_id = c.vendor_id
WHERE c.status = 'Awarded'
GROUP BY v.vendor_id, v.vendor_name, v.city, v.country, v.is_local;

CREATE INDEX idx_mv_vendor_total ON mv_vendor_summary(total_awarded DESC);
```

### 3.3 Revenue by Year

Annual revenue totals by category.

```sql
CREATE MATERIALIZED VIEW mv_revenue_by_year AS
SELECT 
    fy.year_label,
    fy.mayor_name,
    rs.category,
    rs.is_intergovernmental,
    SUM(re.amount) AS total_amount,
    SUM(re.amount)::DECIMAL / SUM(SUM(re.amount)) OVER (PARTITION BY fy.year_id) * 100 AS pct_of_total
FROM revenue_entry re
JOIN fiscal_year fy ON re.year_id = fy.year_id
JOIN revenue_source rs ON re.source_id = rs.source_id
GROUP BY fy.year_id, fy.year_label, fy.mayor_name, rs.category, rs.is_intergovernmental
ORDER BY fy.year_label, total_amount DESC;
```

---

## 4. Sample Queries

### 4.1 Sources → Uses Sankey Data

```sql
-- Get revenue sources and major expense programs for Sankey diagram
WITH sources AS (
    SELECT 
        rs.category AS source_name,
        SUM(re.amount) AS amount
    FROM revenue_entry re
    JOIN revenue_source rs ON re.source_id = rs.source_id
    JOIN fiscal_year fy ON re.year_id = fy.year_id
    WHERE fy.year_label = '2024'
    GROUP BY rs.category
),
uses AS (
    SELECT 
        p.program_name AS target_name,
        SUM(ob.amount) AS amount
    FROM operating_budget ob
    JOIN program p ON ob.program_id = p.program_id
    JOIN fiscal_year fy ON ob.year_id = fy.year_id
    WHERE fy.year_label = '2024' AND ob.is_expense = TRUE
    GROUP BY p.program_name
    ORDER BY amount DESC
    LIMIT 10
)
SELECT 'source' AS type, source_name AS name, amount FROM sources
UNION ALL
SELECT 'target' AS type, target_name AS name, amount FROM uses;
```

### 4.2 Ward Comparison Map Data

```sql
-- Investment per capita by ward for choropleth
SELECT 
    w.ward_number,
    w.ward_name,
    w.geometry,
    COALESCE(SUM(cp.total_10_year), 0) AS total_investment,
    w.population_2021,
    CASE 
        WHEN w.population_2021 > 0 
        THEN ROUND(SUM(cp.total_10_year)::DECIMAL / w.population_2021, 2)
        ELSE 0 
    END AS per_capita,
    COUNT(cp.project_id) AS project_count
FROM ward w
LEFT JOIN capital_project cp ON w.ward_id = cp.ward_id AND cp.base_year = 2024
GROUP BY w.ward_id, w.ward_number, w.ward_name, w.geometry, w.population_2021
ORDER BY per_capita DESC;
```

### 4.3 Top Contracts with Vendor Details

```sql
-- Top 20 contracts for current year
SELECT 
    c.doc_number,
    v.vendor_name,
    v.city AS vendor_city,
    c.category,
    c.division,
    c.awarded_amount,
    c.award_date,
    LEFT(c.description, 200) AS description_preview
FROM contract c
JOIN vendor v ON c.vendor_id = v.vendor_id
JOIN fiscal_year fy ON c.year_id = fy.year_id
WHERE fy.year_label = '2024' AND c.status = 'Awarded'
ORDER BY c.awarded_amount DESC
LIMIT 20;
```

### 4.4 Program Budget Trends

```sql
-- YoY budget comparison for major programs
SELECT 
    p.program_name,
    fy.year_label,
    SUM(ob.amount) AS total_budget,
    LAG(SUM(ob.amount)) OVER (PARTITION BY p.program_id ORDER BY fy.year_label) AS prev_year,
    ROUND(
        (SUM(ob.amount) - LAG(SUM(ob.amount)) OVER (PARTITION BY p.program_id ORDER BY fy.year_label))::DECIMAL 
        / NULLIF(LAG(SUM(ob.amount)) OVER (PARTITION BY p.program_id ORDER BY fy.year_label), 0) * 100
    , 1) AS yoy_change_pct
FROM operating_budget ob
JOIN program p ON ob.program_id = p.program_id
JOIN fiscal_year fy ON ob.year_id = fy.year_id
WHERE ob.is_expense = TRUE
  AND p.program_name IN ('Toronto Transit Commission', 'Toronto Police Service', 
                          'Shelter, Support & Housing', 'Parks, Forestry & Recreation')
GROUP BY p.program_id, p.program_name, fy.year_id, fy.year_label
ORDER BY p.program_name, fy.year_label;
```

---

## 5. Data Import Mappings

### 5.1 Capital Budget XLSX → Database

| Excel Column | Database Column | Transform |
|--------------|-----------------|-----------|
| Ward Number | ward_id | Lookup in `ward` table |
| Ward | (validation) | Match ward_name |
| Program/Agency Name | program_id | Lookup/create in `program` |
| Project Name | project_name | Direct |
| Sub-Project Name | subproject_name | Direct |
| Category | category | Direct |
| Year 1 | year_1 | Multiply by 1000 (values in $000s) |
| Year 2 | year_2 | Multiply by 1000 |
| ... | ... | ... |
| Total 10 Year | (computed) | Auto-generated |

### 5.2 Contracts API → Database

| API Field | Database Column | Transform |
|-----------|-----------------|-----------|
| unique_id | external_id | Direct |
| Document Number | doc_number | Direct |
| Successful Supplier | vendor_id | Lookup/create vendor |
| Awarded Amount | awarded_amount | Parse to integer |
| Award Date | award_date | Parse date |
| RFx (Solicitation) Type | rfx_type | Direct |
| High Level Category | category | Direct |
| Division | division | Direct |
| Solicitation Document Description | description | Direct |
| Supplier Address | vendor.address | Parse, update vendor |

---

## 6. API Response Schemas

### 6.1 GET /api/sources/{year}

```json
{
  "year": "2024",
  "total_revenue": 10850000000,
  "sources": [
    {
      "category": "Taxation",
      "amount": 5200000000,
      "percentage": 47.9,
      "subcategories": [
        {"name": "Residential Property Tax", "amount": 3800000000},
        {"name": "Commercial Property Tax", "amount": 1200000000},
        {"name": "Industrial Property Tax", "amount": 200000000}
      ]
    },
    {
      "category": "Grants",
      "amount": 2990000000,
      "percentage": 27.6,
      "is_intergovernmental": true,
      "subcategories": [
        {"name": "Provincial - Conditional", "amount": 1800000000},
        {"name": "Provincial - Unconditional", "amount": 300000000},
        {"name": "Federal", "amount": 890000000}
      ]
    }
  ]
}
```

### 6.2 GET /api/wards/{ward_id}

```json
{
  "ward_id": 11,
  "ward_number": 11,
  "ward_name": "University-Rosedale",
  "councillor": "Dianne Saxe",
  "population": 105432,
  "investment_summary": {
    "total_10_year": 287500000,
    "per_capita": 2727,
    "city_avg_per_capita": 2150,
    "rank": 8,
    "current_year": 42300000
  },
  "by_category": [
    {"category": "Water Infrastructure", "amount": 142000000, "pct": 49.4},
    {"category": "Transportation", "amount": 89000000, "pct": 31.0},
    {"category": "Parks & Recreation", "amount": 34000000, "pct": 11.8}
  ],
  "top_projects": [
    {
      "project_id": 4521,
      "name": "Transmission Watermain Replacement",
      "subproject": "Rowanwood Avenue",
      "total_budget": 27500000,
      "years": "2024-2026",
      "contractor": "Erritt Construction Ltd."
    }
  ],
  "geometry": {"type": "MultiPolygon", "coordinates": [...]}
}
```

### 6.3 GET /api/contracts

```json
{
  "total_count": 845,
  "total_value": 1250000000,
  "filters_applied": {
    "year": "2024",
    "category": "Construction Services"
  },
  "contracts": [
    {
      "contract_id": 1,
      "doc_number": "Doc4053424337",
      "vendor": {
        "name": "DAMEN SHIPBUILDING 5 B.V.",
        "city": "Gorinchem",
        "country": "Netherlands"
      },
      "amount": 90569194,
      "date": "2024-09-10",
      "division": "Parks, Forestry & Recreation",
      "category": "Construction Services",
      "description": "Pax and RoPax Ferry Vessels for the Toronto Island"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_pages": 43
  }
}
```

---

## 7. Indexes Summary

```sql
-- Primary lookup indexes
CREATE INDEX idx_revenue_year ON revenue_entry(year_id);
CREATE INDEX idx_opbudget_year ON operating_budget(year_id);
CREATE INDEX idx_capproject_ward ON capital_project(ward_id);
CREATE INDEX idx_capproject_year ON capital_project(base_year);
CREATE INDEX idx_contract_date ON contract(award_date);
CREATE INDEX idx_contract_vendor ON contract(vendor_id);

-- Geographic indexes
CREATE INDEX idx_ward_geometry ON ward USING GIST(geometry);
CREATE INDEX idx_capproject_geometry ON capital_project USING GIST(geometry);

-- Full-text search
CREATE INDEX idx_contract_desc ON contract USING GIN(to_tsvector('english', description));
CREATE INDEX idx_project_name ON capital_project USING GIN(to_tsvector('english', project_name));
```

---

*Schema Version: 1.0 | PostgreSQL 15+ with PostGIS*
