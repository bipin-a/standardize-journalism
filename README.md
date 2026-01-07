# Toronto Money Flow

An interactive dashboard exploring how Toronto raises and spends public money. Built to make municipal finance accessible to everyone.

**Live:** [toronto-money-flow.vercel.app](https://toronto-money-flow.vercel.app)

---

## AI Disclaimer

This codebase was written with:

- **Claude Code** (Anthropic)
- **Codex** (OpenAI)

The AI assistants helped with code generation, refactoring, documentation, and debugging. 

**All code has been reviewed and tested by humans.**

---

## What It Does

- **Money Flow** – Visualize where Toronto's revenue comes from and where it goes with an interactive Sankey diagram
- **Capital Investment** – See how infrastructure spending is distributed across wards with choropleth maps
- **Spending by Type** – Break down purchases by category and department
- **Procurement** – Track city contracts, vendor concentration, and non-competitive awards
- **Budget vs Actual** – Compare planned operating budget to FIR actuals (city-wide)
- **Council Decisions** – Follow recent motions, voting patterns, and lobbying activity
- **AI Chat** – Ask questions in plain English and get answers grounded in the actual data

---

## Vision

- Personalized views by neighborhood, interests, and concerns so every resident sees what matters locally
- Weekly recap posts or email digests that summarize what changed and what to watch next
- Built to answer three core questions:
    1) Where does money come from and where does it go?
    2) Is Toronto seeing a return on investment? (Budget vs Actual will inform this; still evolving.)
    3) Are leaders making "good" decisions? Early signals come from the Council Decisions data.
- Exploratory by design: this is meant to spark questions and curiosity, not serve as audited reporting

---

## How to Interact

1. Start with the dashboard sections (cards on the home page) and adjust the year selectors to focus your view.
2. Use the chat bubble to ask specific questions. Include context (year, ward, topic) for clearer answers.
3. Want a new view or notice a data issue? Open a GitHub issue with steps, links, and the section name.

---

## Data Sources

All data comes from [Toronto Open Data](https://open.toronto.ca/):

| Dataset | Type | Update Frequency |
|---------|------|------------------|
| [Financial Information Return (FIR)](https://open.toronto.ca/dataset/financial-information-return/) | ETL (XLSX) | Annual |
| [Operating Budget (Program Summary by Expenditure Category)](https://open.toronto.ca/dataset/budget-operating-budget-program-summary-by-expenditure-category/) | ETL (XLSX) | Annual |
| [Capital Budget by Ward](https://open.toronto.ca/dataset/budget-capital-budget-plan-by-ward-10-yr-approved/) | ETL (XLSX) | Annual |
| [Council Voting Records](https://open.toronto.ca/dataset/council-recording-votes/) | ETL (API) | Ongoing |
| [Lobbyist Registry](https://open.toronto.ca/dataset/lobbyist-registry/) | ETL (XML) | Ongoing |
| [Ward Boundaries](https://open.toronto.ca/dataset/city-wards/) | ETL (GeoJSON) | As needed |
| [Awarded Contracts](https://open.toronto.ca/dataset/tobids-awarded-contracts/) | Live API | Real-time |
| [Non-Competitive Contracts](https://open.toronto.ca/dataset/tobids-non-competitive-contracts/) | Live API | Real-time |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ 
- **Python** 3.11+ (only if running ETL locally)
- **uv** (ETL runner)
- **gcloud CLI** (only if uploading ETL outputs to GCS)

### Run the Dashboard

```bash
# Clone the repo
git clone https://github.com/bipin-a/standardize-journalism.git
cd standardize-journalism

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

> **Note:** The dashboard fetches pre-processed data from GCS by default. No local ETL needed for basic usage.

### Environment Variables

Create a `.env.local` file (see `.env.example` for the full list, including ETL/GCP settings):

```bash
# Required for data (public GCS bucket)
GCS_BASE_URL=https://storage.googleapis.com/standardize-journalism-data

# Required for AI chat (pick one provider)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OR use OpenAI instead
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...
```

### Run ETL Locally (Optional)

If you need fresh data or want to modify the pipeline, the ETL runner uses `uv` and the gcloud CLI for uploads.
Make sure you are authenticated and have the GCP env vars in `.env.example` set.

```bash
# Run the full pipeline (processed + gold + uploads)
./scripts/publish_data_gcs.sh all
```

This downloads from Toronto Open Data, processes files, and generates gold summaries.
See `etl/README.md` for full ETL setup and pipeline details.

---

## Project Structure

```
├── app/                    # Next.js app
│   ├── api/               # API routes
│   │   ├── money-flow/    # Revenue & expense data
│   │   ├── capital-by-ward/
│   │   ├── council-decisions/
│   │   ├── metric/        # Procurement (live CKAN)
│   │   ├── chat/          # AI assistant
│   │   └── _lib/          # Shared utilities
│   ├── components/        # React components
│   │   ├── MoneyFlowSankey.jsx
│   │   ├── ChatWidget.js
│   │   └── sections/
│   └── [page routes]
│
├── etl/                    # Python ETL scripts
│   ├── config.yaml        # Dataset URLs & settings
│   ├── financial_return_etl.py
│   ├── capital_by_ward_etl.py
│   └── ...
│
├── data/                   # Local data (gitignored)
│   ├── gold/              # Pre-aggregated API responses
│   ├── processed/         # Full normalized datasets
│   └── raw/               # ETL intermediates
│
└── scripts/
    └── publish_data_gcs.sh # ETL runner
```

---

## Tech Stack

- **Frontend:** Next.js 14, React 18
- **Visualization:** D3.js (Sankey diagrams, choropleth maps)
- **ETL:** Python (pandas, openpyxl)
- **Storage:** Google Cloud Storage
- **AI:** Anthropic Claude / OpenAI GPT (tool routing + RAG)
- **Hosting:** Vercel (or any Node.js host)


---

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm run test` (smoke tests)
5. Submit a PR

### Issues, Pull Requests, and Expectations

- Issues and PRs are enabled. Please use the templates (auto-selected when you open a new issue or PR).
- For issues, include: what you expected, what you saw, steps to reproduce, URL/section, and screenshots if possible.
- For data questions, share the source link or CSV slice you are referencing.
- Reviews happen on a best-effort basis; accuracy, safety, and data quality are prioritized first.
- This project is exploratory and not audited reporting. Use the data to frame questions and investigations.


---

## Acknowledgments

- [City of Toronto Open Data](https://open.toronto.ca/) for making this possible
