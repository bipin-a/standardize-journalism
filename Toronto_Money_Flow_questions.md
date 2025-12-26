# Toronto Money Flow v0.002 — Product Spec (Mayor + Citizen)

**Date:** December 25, 2025  
**Status:** Proposed  
**Goal:** Ship one meaningful branch end-to-end using Toronto Open Data via the Toronto MCP connector.

---

## 1) The Three Big Questions (Broken Down)

This platform should help both:
- **A Mayor** decide where to allocate scarce dollars, justify tradeoffs, and manage governance risk.
- **A Concerned Citizen** understand where money goes, whether it’s fair, and whether leaders are being responsible.

### Q1. Where does money come from, and where does money go?

**Q1A — Sources (Revenue):** “What pays for the city?”
- Leaf questions
  - What % comes from taxes vs transfers vs fees?
  - Which revenue sources are growing/shrinking (YoY)?
  - How dependent are we on other governments?
- Example KPIs
  - Revenue mix (% by category)
  - YoY change by revenue source
- Data reality
  - Often **XLSX-only** (requires ETL) for full coverage.

**Q1B — Uses (Budget):** “What programs are we funding?”
- Leaf questions
  - Which programs dominate operating spending?
  - What’s changing the most year-over-year?
- Example KPIs
  - Operating spend by program (% share)
  - Top-program concentration (top 10 share)
  - YoY deltas by program
- Data reality
  - Often **XLSX-only** (requires ETL).

**Q1C — Uses (Procurement / Contracts):** “What are we buying, from whom, and through which divisions?”
- Leaf questions
  - How much is being awarded, and how many awards?
  - Which divisions and categories drive awards?
  - Who are the top vendors, and how concentrated is spend?
  - How much is non-competitive vs competitive?
- Example KPIs
  - Total awarded amount, contract count
  - Spend by division/category/RFX type
  - Vendor concentration (Top 10 share)
  - Non-competitive share (amount + count)
- Data reality
  - **Datastore-active** and reachable via Toronto MCP.

**Q1D — Geography:** “Where does spending land on the map?”
- Leaf questions
  - Which wards receive the most/least per capita?
  - Are disparities narrowing over time?
- Example KPIs
  - $\text{Ward investment per capita} = \text{Ward capital total} / \text{Ward population}$
  - Distribution spread (p90/p10, max/min)
- Data reality
  - Capital by ward often **XLSX-only** (ETL). Ward boundaries are available via MCP.

---

### Q2. Is Toronto seeing a return on its investments?

This should be framed as **evidence of outcomes**, not a single magic ROI number.

**Q2A — Service ROI (Operating $ → service outcomes)**
- Leaf questions
  - Are outcomes improving where we invest?
  - What is the cost per unit of outcome over time?
- Example KPIs
  - Outcome-per-$ and trend direction
  - Outcome trend vs spend trend (same period)
- Data reality
  - Requires pairing **budget data (ETL)** with **outcome datasets** (some may be MCP-accessible; varies by domain).

**Q2B — Asset ROI (Capital $ → asset condition/reliability)**
- Leaf questions
  - Are failures/outages decreasing after investments?
  - Is the backlog shrinking?
- Example KPIs
  - Incident rate, condition distribution, backlog trend
- Data reality
  - Often mixed sources; capital plan is frequently ETL.

**Q2C — Economic ROI (Infrastructure $ → economic proxies)**
- Leaf questions
  - Do investment patterns correlate with growth proxies (permits, development activity)?
- Example KPIs
  - Permits issued/value, development charges trend
- Data reality
  - MCP can help discover these datasets; must state “correlation ≠ causation”.

---

### Q3. Are leaders making good decisions?

**Q3A — Governance quality (Procurement health)**
- Leaf questions
  - Are we overly reliant on a small set of vendors?
  - Is non-competitive contracting unusually high, and where?
  - Is spending clustered in a few divisions/categories?
- Example KPIs
  - Vendor concentration (Top 1, Top 10 share)
  - Non-competitive share and which divisions drive it
  - Category/division concentration

**Q3B — Equity (geographic fairness)**
- Leaf questions
  - Which wards consistently receive less investment per capita?
  - Are allocations aligned to need (population, infrastructure condition, etc.)?
- Example KPIs
  - Ward investment per capita distribution and stability over time

**Q3C — Delivery (on time / on budget)**
- Leaf questions
  - Are projects delivered as planned?
- Example KPIs
  - Delay rate, budget variance, change orders
- Data reality
  - Hardest to do with open data; likely later.

Q3D - What decisions are the leaders making?
- Look at the most recent notes from meetings, action items etc. 
- Organize the deicions, into categories. 

Q3E - How many mistakes have leaders made? 


---

## 2) v0.002 Product Slice (What we ship next)

**v0.002 should answer one branch end-to-end** without requiring budget ETL yet.

### v0.002 Focus
Ship **Q1C + Q3A** using procurement data:
- “Where is money going (via contracts)?”
- “Is procurement governance healthy?”

### v0.002 KPI Set (6–8 deliverables)
**Core (must-have)**
1. **Total awarded amount** for the selected period + **contract count**
2. **Non-competitive awarded amount** + **share of total** (amount + count)
3. **Top vendor concentration** (Top 1 share, Top 10 share)
4. **Top vendors table** (top 5–10 vendors: $ awarded + count)
5. **Awards by division** (top 10)
6. **Awards by category/commodity type** (top 10)

**Optional (nice-to-have if low effort)**
7. **Median award size** + buckets (small/medium/large)
8. **Monthly trend** across the last 12–18 months (bounded by retention)

---

## 3) Data Sources & MCP Mapping

### Toronto MCP tools (conceptual usage)
- `analyze_dataset_structure` — confirm field names/types for filtering
- `get_resource_records` — paginate through records
- `find_relevant_datasets` — later: discover outcome datasets for ROI

### v0.002 datasets (datastore-active)
- **Awarded contracts:** package `tobids-awarded-contracts`
- **Non-competitive contracts:** package `tobids-non-competitive-contracts`

---

## 4) Definitions & Caveats (must be explicit in UI)

1. **Retention window:** ToBids contract records are typically available for ~18 months.
   - Implication: “2024 totals” may be incomplete depending on current date and retention.
2. **Awarded ≠ paid:** awards indicate contract award values, not invoice payments/actual spend.
3. **Year filtering:** must be based on the dataset’s award date field (and consistently applied).
4. **Pagination:** totals must be computed across all pages, not just the first batch.
5. **Currency parsing:** award values may be strings with `$` and commas.

---

## 5) v0.002 Acceptance Criteria (Definition of Done)

**Data correctness**
- Computes totals across full pagination (no fixed 1000-row ceiling).
- Selected period filter is applied consistently across Awarded + Non-Competitive datasets.
- All displayed $ values are numeric-sum correct and formatted.

**Governance insights**
- Shows Top 1 and Top 10 vendor concentration.
- Shows non-competitive share (amount + count) and identifies top divisions driving it.

**UX (minimal, no extra features)**
- A dashboard view with:
  - A small set of stat cards (Total, Count, Non-competitive share, Top10 share)
  - A breakdown by division
  - A breakdown by category/commodity type
  - A top vendors table
- Displays caveats clearly (retention window, awarded ≠ paid).

**Performance & stability**
- Avoids repeated heavy fetch on every render; uses a sensible caching approach for the API layer.

---

## 6) What v0.003 Likely Adds (Not in v0.002)

- Capital budget by ward (requires XLSX ETL)
- Operating budget program breakdown (requires XLSX ETL)
- Ward map equity analysis (requires ETL + population)
- ROI/outcomes modules (requires selecting outcome datasets + careful interpretation)
