# Toronto Money Flow
## Technical Project Plan

**Version:** 1.0  
**Date:** December 2025  
**Target Audience:** Technical Project Managers

---

## 1. Executive Summary

Toronto Money Flow is a transparency platform that visualizes the complete financial picture of Toronto's municipal government. By connecting revenue sources to spending destinations, the platform answers: **"Where does the city's money come from, and where does it go?"**

### Core Value Proposition
- **For Residents:** Understand how tax dollars flow from collection to projects in their ward
- **For Journalists:** Access structured data on contracts, vendors, and budget allocations
- **For Researchers:** Analyze investment patterns across administrations and geographies

### Data Strategy
| Phase | Scope | Data Sources |
|-------|-------|--------------|
| Phase 1 (MVP) | Toronto Open Data only | Capital Budget, Operating Budget, Contracts, Development Charges |
| Phase 2 | Add provincial context | Ontario Financial Information Return, Transfer Payment data |
| Phase 3 | Full intergovernmental | Federal infrastructure grants, multi-city comparisons |

---

## 2. System Architecture

### 2.1 Conceptual Model: Sources → Uses

```
┌─────────────────────────────────────────────────────────────────┐
│                      MONEY SOURCES                               │
├─────────────────────────────────────────────────────────────────┤
│  Property Taxes │ Provincial Grants │ Federal Grants │ Dev Charges │ User Fees │
│      ~48%       │       ~20%        │      ~8%       │     ~6%     │   ~18%    │
└────────┬────────┴─────────┬─────────┴────────┬───────┴─────┬─────┴─────┬─────┘
         │                  │                  │             │           │
         └──────────────────┴──────────────────┴─────────────┴───────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │    CITY OF TORONTO       │
                        │    CONSOLIDATED BUDGET   │
                        │    ~$16B Operating       │
                        │    ~$5B Capital          │
                        └──────────────┬───────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  BY PROGRAM     │         │  BY GEOGRAPHY   │         │  BY VENDOR      │
│  (Operating)    │         │  (Capital)      │         │  (Contracts)    │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ TTC: 32%        │         │ Ward 1: $XXM    │         │ Vendor A: $XXM  │
│ Police: 18%     │         │ Ward 2: $XXM    │         │ Vendor B: $XXM  │
│ Shelter: 12%    │         │ ...             │         │ ...             │
│ Fire: 8%        │         │ Ward 25: $XXM   │         │                 │
│ Parks: 6%       │         │                 │         │                 │
│ Other: 24%      │         │ + City-wide     │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### 2.2 Technical Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React + Next.js | Dashboard UI |
| Visualization | D3.js + Mapbox GL | Sankey diagrams, choropleth maps |
| Backend | Node.js + Express | API layer |
| Database | PostgreSQL | Structured budget data |
| Data Pipeline | Python (pandas) | XLSX parsing and ETL |
| LLM Interface | Claude API + MCP | Natural language queries |
| File Storage | S3-compatible | Raw XLSX archive |

### 2.3 Data Flow Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Toronto Open    │────▶│ ETL Pipeline    │────▶│ PostgreSQL      │
│ Data Portal     │     │ (Python/pandas) │     │ Database        │
│ - XLSX files    │     │ - Parse Excel   │     │ - Normalized    │
│ - CSV files     │     │ - Clean data    │     │ - Indexed       │
│ - JSON APIs     │     │ - Transform     │     │ - Time-series   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │ MCP Connector   │◀─────────────┤
                        │ (Real-time API) │              │
                        └────────┬────────┘              │
                                 │                       │
                                 ▼                       ▼
                        ┌─────────────────────────────────────────┐
                        │           REST API Layer                 │
                        │  /api/sources - Revenue breakdown        │
                        │  /api/wards/{id}/budget - Ward spending  │
                        │  /api/contracts - Vendor awards          │
                        │  /api/programs - Operating budget        │
                        │  /api/query - LLM natural language       │
                        └─────────────────────────────────────────┘
                                          │
                                          ▼
                        ┌─────────────────────────────────────────┐
                        │           React Frontend                 │
                        │  - Sankey (sources → uses)              │
                        │  - Ward map (geographic investment)     │
                        │  - Vendor table (contract awards)       │
                        │  - Trend charts (historical analysis)   │
                        │  - Chat interface (ask questions)       │
                        └─────────────────────────────────────────┘
```

---

## 3. Data Sources & Schema

### 3.1 Primary Datasets

| Dataset | Package ID | Format | Records | Update Freq | Geographic |
|---------|------------|--------|---------|-------------|------------|
| Capital Budget by Ward | `7d3bcf2f-8eca-4ed5-a352-a34adb130931` | XLSX | ~5,000/year | Annual | ✅ Ward |
| Operating Budget | `2c90a5d3-5598-4c02-abf2-169456c8f1f1` | XLSX | ~50,000/year | Annual | ❌ |
| Awarded Contracts | `f78fe449-53f4-4962-9ec8-8f7eeece1072` | CSV/JSON | ~850 active | Daily | ✅ Address |
| Revenues & Expenses | `734d5877-f4de-4322-9851-882d22e1a11f` | XLSX | ~500 rows | Annual | ❌ |
| Development Charges | `4443f9c3-e568-4505-b77d-b8913df2417f` | XLSX | ~200/year | Monthly | ❌ |
| Ward Boundaries | `5e7a8234-f805-43ac-820f-03d7c360b588` | GeoJSON | 25 wards | As needed | ✅ Polygon |
| Neighbourhoods | `fc443770-ef0a-4025-9c2c-2cb558bfab00` | GeoJSON | 158 areas | As needed | ✅ Polygon |

### 3.2 Revenue Categories (Schedule 10)

Based on Ontario Financial Information Return structure:

| Category | Sub-categories | Example |
|----------|---------------|---------|
| **Taxation** | Property taxes, payments in lieu | $5.2B |
| **Provincial Transfers** | Unconditional grants, conditional grants (transit, housing, social services) | $2.1B |
| **Federal Transfers** | Infrastructure programs, housing subsidies | $890M |
| **User Fees** | Transit fares, recreation fees, permits | $1.2B |
| **Development Charges** | Transit DC, Water DC, Parks DC | $650M |
| **Other** | Investment income, donations, fines | $600M |

### 3.3 Expense Categories (Schedule 40)

| Functional Area | Sub-functions |
|-----------------|---------------|
| General Government | Council, Admin, Finance |
| Protection | Police, Fire, EMS, Courts |
| Transportation | Roads, Transit, Parking |
| Environmental | Water, Wastewater, Solid Waste |
| Health | Public Health, Ambulance |
| Social & Family | Housing, Shelter, Childcare |
| Recreation & Culture | Parks, Libraries, Culture |
| Planning & Development | Zoning, Building, Economic Dev |

---

## 4. User Experience Specification

### 4.1 Primary Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TORONTO MONEY FLOW                                    [2024 ▼] [Export]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     SANKEY: SOURCES → USES                         │ │
│  │                                                                     │ │
│  │   Property Tax ═══════════════╗                                    │ │
│  │   $5.2B (48%)                 ║                                    │ │
│  │                               ║══════════▶ Transit $3.8B           │ │
│  │   Provincial ═════════════════╣                                    │ │
│  │   $2.1B (20%)                 ║══════════▶ Police $1.2B            │ │
│  │                               ║                                    │ │
│  │   Federal ════════════════════╣══════════▶ Shelter $890M           │ │
│  │   $890M (8%)                  ║                                    │ │
│  │                               ║══════════▶ Fire $650M              │ │
│  │   Dev Charges ════════════════╣                                    │ │
│  │   $650M (6%)                  ║══════════▶ Parks $580M             │ │
│  │                               ║                                    │ │
│  │   User Fees ══════════════════╝══════════▶ Other $2.1B             │ │
│  │   $1.8B (18%)                                                      │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │  WARD INVESTMENT MAP        │  │  TOP CONTRACTS                  │   │
│  │  ┌─────────────────────┐    │  │                                 │   │
│  │  │                     │    │  │  1. Damen Shipbuilding  $90.5M  │   │
│  │  │    [Toronto Map]    │    │  │     Ferry Vessels               │   │
│  │  │    Color by $/capita│    │  │                                 │   │
│  │  │                     │    │  │  2. GIP Paving Inc     $89.1M   │   │
│  │  │  Click ward for     │    │  │     Basement Flooding Program   │   │
│  │  │  project details    │    │  │                                 │   │
│  │  │                     │    │  │  3. Drainstar          $65.9M   │   │
│  │  └─────────────────────┘    │  │     Sewer Infrastructure        │   │
│  │                             │  │                                 │   │
│  │  Legend: $200-$2000/capita  │  │  [View All Contracts →]         │   │
│  └─────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 💬 Ask a question: "How much is being spent on transit in Ward 10?"│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Key User Interactions

| Interaction | Action | Result |
|-------------|--------|--------|
| **Sankey hover** | Hover on flow | Tooltip: exact amount, % of total |
| **Sankey click** | Click on program node | Drill into sub-programs |
| **Map click** | Click on ward | Side panel: ward projects, 10-year plan |
| **Map toggle** | Switch metric | Change from total $ to $/capita |
| **Contract filter** | Select category | Filter by Construction/Services/Goods |
| **Year selector** | Change year | Reload all visualizations for that year |
| **LLM query** | Ask question | Return data-backed answer with sources |
| **Export** | Click export | Download CSV/PDF of current view |

### 4.3 Ward Detail Panel

When a user clicks on a ward:

```
┌─────────────────────────────────────────┐
│  WARD 11: University-Rosedale          │
│  Councillor: [Name]                     │
├─────────────────────────────────────────┤
│                                         │
│  CAPITAL INVESTMENT (10-Year Plan)      │
│  Total: $287.5M                         │
│  Per Capita: $1,842                     │
│  Rank: 8 of 25 wards                    │
│                                         │
│  BY CATEGORY                            │
│  ████████████ Water/Sewer    $142M      │
│  ██████████ Transportation   $89M       │
│  ████ Parks & Rec           $34M        │
│  ██ Other                   $22M        │
│                                         │
│  TOP PROJECTS                           │
│  ┌─────────────────────────────────────┐│
│  │ Transmission Watermain Replacement  ││
│  │ Rowanwood Ave                       ││
│  │ Budget: $27.5M | 2024-2026          ││
│  │ Contractor: Erritt Construction     ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ Road Reconstruction Program         ││
│  │ Multiple locations                  ││
│  │ Budget: $18.2M | 2024-2028          ││
│  └─────────────────────────────────────┘│
│                                         │
│  [View All 47 Projects →]               │
│                                         │
└─────────────────────────────────────────┘
```

---

## 5. KPI Definitions

### 5.1 Source Metrics

| KPI | Formula | Purpose |
|-----|---------|---------|
| **Tax Revenue Share** | Property Tax / Total Revenue × 100 | Dependency on local taxes |
| **Intergovernmental Ratio** | (Provincial + Federal) / Total Revenue × 100 | External funding dependency |
| **Development Charge Trend** | YoY % change in DC revenue | Development activity indicator |
| **Revenue Diversification Index** | Herfindahl index of revenue sources | Financial resilience |

### 5.2 Spending Metrics

| KPI | Formula | Purpose |
|-----|---------|---------|
| **Ward Investment Per Capita** | Ward Capital Budget / Ward Population | Equity analysis |
| **Program Budget Share** | Program Budget / Total Operating × 100 | Priority indication |
| **Contract Concentration** | Top 10 Vendors / Total Awarded × 100 | Vendor diversity |
| **Capital vs Operating Ratio** | Capital Budget / Operating Budget | Investment vs maintenance |

### 5.3 Comparison Metrics

| KPI | Formula | Purpose |
|-----|---------|---------|
| **Ward Investment Variance** | (Ward $/capita - City Avg) / City Avg × 100 | Geographic equity |
| **YoY Budget Change** | (Current Year - Prior Year) / Prior Year × 100 | Trend analysis |
| **Administration Comparison** | Spending by program by mayoral term | Leadership priorities |

---

## 6. Development Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Week | Deliverables |
|------|-------------|
| 1-2 | Data pipeline: Download and parse XLSX files (Capital, Operating, Revenue) |
| 3 | Database schema implementation, initial data load |
| 4 | Basic API endpoints: `/sources`, `/wards`, `/programs` |

### Phase 2: Core Visualizations (Weeks 5-8)

| Week | Deliverables |
|------|-------------|
| 5-6 | Sankey diagram: Sources → Major Programs |
| 7 | Ward choropleth map with investment data |
| 8 | Ward detail panel with project list |

### Phase 3: Contracts & Vendors (Weeks 9-10)

| Week | Deliverables |
|------|-------------|
| 9 | Contract data integration (API-based, real-time) |
| 10 | Vendor analysis views, filtering, search |

### Phase 4: Intelligence Layer (Weeks 11-12)

| Week | Deliverables |
|------|-------------|
| 11 | LLM query interface with MCP tools |
| 12 | Historical trend analysis, administration comparison |

### Phase 5: Polish & Launch (Weeks 13-14)

| Week | Deliverables |
|------|-------------|
| 13 | Performance optimization, mobile responsiveness |
| 14 | Documentation, launch preparation, user testing |

---

## 7. Data Pipeline Specification

### 7.1 ETL Process

```python
# Pseudocode for annual budget ingestion

def ingest_capital_budget(year):
    """Download and parse capital budget XLSX"""
    
    # 1. Download from Toronto Open Data
    url = f"https://ckan0.cf.opendata.inter.prod-toronto.ca/..."
    xlsx = download(url)
    
    # 2. Parse Excel (multiple sheets possible)
    df = pd.read_excel(xlsx, sheet_name='By Ward')
    
    # 3. Normalize columns
    df = df.rename(columns={
        'Ward Number': 'ward_id',
        'Project Name': 'project_name',
        'Year 1': f'budget_{year}',
        ...
    })
    
    # 4. Clean currency (values in $000s)
    df['budget'] = df['budget'] * 1000
    
    # 5. Upsert to database
    upsert_capital_budget(df)
```

### 7.2 Refresh Schedule

| Dataset | Frequency | Method | Trigger |
|---------|-----------|--------|---------|
| Awarded Contracts | Daily | API pull | Scheduled job 6 AM |
| Development Charges | Monthly | XLSX download | 1st of month |
| Operating Budget | Annual | XLSX download | April (post-approval) |
| Capital Budget | Annual | XLSX download | April (post-approval) |
| Ward Boundaries | As needed | Manual | Ward redistribution |

### 7.3 Data Quality Checks

| Check | Rule | Action on Failure |
|-------|------|-------------------|
| Completeness | All 25 wards present | Alert + block update |
| Sum validation | Ward totals = City total ± 1% | Warning |
| Year continuity | No gaps in annual data | Alert |
| Currency format | All amounts positive integers | Clean + log |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| XLSX format changes | Medium | High | Schema validation layer, versioned parsers |
| Data publication delays | Medium | Medium | Display "as of" dates, cache previous year |
| Contract data 18-month limit | Certain | Medium | Archive data monthly, build historical database |
| Ward redistribution | Low | High | Design for ward ID abstraction |
| Large file sizes | Medium | Low | Incremental loading, pagination |
| LLM hallucination | Medium | Medium | Cite sources, constrain to available data |

---

## 9. Success Metrics

### 9.1 Platform Metrics

| Metric | Target (6 months) | Target (12 months) |
|--------|-------------------|---------------------|
| Monthly Active Users | 2,000 | 10,000 |
| Average Session Duration | 3 minutes | 5 minutes |
| Return User Rate | 25% | 40% |
| Data Export Downloads | 100/month | 500/month |

### 9.2 Impact Metrics

| Metric | Target |
|--------|--------|
| Media citations | 5+ articles referencing platform data |
| Council references | 1+ mention in council/committee meetings |
| FOIA reduction | Qualitative: journalists report faster access |
| Community groups using | 3+ organizations citing in advocacy |

### 9.3 Data Quality Metrics

| Metric | Target |
|--------|--------|
| Data freshness | Contracts < 24 hours old |
| Coverage | 100% of capital budget by ward |
| Query success rate | 90% of LLM queries return useful results |
| Uptime | 99.5% |

---

## 10. Appendix

### A. Toronto Open Data Package IDs

```
Capital Budget by Ward:      7d3bcf2f-8eca-4ed5-a352-a34adb130931
Operating Budget:            2c90a5d3-5598-4c02-abf2-169456c8f1f1
Awarded Contracts:           f78fe449-53f4-4962-9ec8-8f7eeece1072
Non-Competitive Contracts:   70509567-870b-4170-99a6-8f520c60051e
Revenues & Expenses:         734d5877-f4de-4322-9851-882d22e1a11f
Development Charges:         4443f9c3-e568-4505-b77d-b8913df2417f
Ward Boundaries:             5e7a8234-f805-43ac-820f-03d7c360b588
Neighbourhoods:              fc443770-ef0a-4025-9c2c-2cb558bfab00
```

### B. Key API Endpoints (Toronto Bids)

```
Contracts Datastore:
https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/e211f003-5909-4bea-bd96-d75899d8e612

Query Parameters:
- limit: Number of records
- offset: Pagination
- filters: JSON filter object
```

### C. Ward Population Data (2021 Census)

Required for per-capita calculations. Source: Statistics Canada Census Profile or Toronto ward profiles dataset.

---

*Document Version: 1.0 | Last Updated: December 2025*
