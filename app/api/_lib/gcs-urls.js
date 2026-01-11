const DEFAULT_GCS_BASE_URL = 'https://storage.googleapis.com/standardize-journalism-data'

const normalizeBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, '')

export const getGcsBaseUrl = () => {
  const baseUrl = process.env.GCS_BASE_URL || DEFAULT_GCS_BASE_URL
  return normalizeBaseUrl(baseUrl)
}

export const getMoneyFlowIndexUrl = () =>
  process.env.MONEY_FLOW_GOLD_INDEX_URL || `${getGcsBaseUrl()}/gold/money-flow/index.json`

export const getCapitalIndexUrl = () =>
  process.env.CAPITAL_GOLD_INDEX_URL || `${getGcsBaseUrl()}/gold/capital/index.json`

export const getCouncilSummaryUrl = () =>
  process.env.COUNCIL_SUMMARY_URL || `${getGcsBaseUrl()}/gold/council-decisions/summary.json`

export const getCouncilIndexUrl = () =>
  process.env.COUNCIL_INDEX_URL || `${getGcsBaseUrl()}/gold/council-decisions/index.json`

export const getCouncilTrendsUrl = () =>
  process.env.COUNCIL_TRENDS_URL || `${getGcsBaseUrl()}/gold/council-decisions/trends.json`

export const getLobbyistTrendsUrl = () =>
  process.env.LOBBYIST_TRENDS_URL || `${getGcsBaseUrl()}/gold/lobbyist-registry/trends.json`

export const getRagIndexUrl = () =>
  process.env.RAG_INDEX_URL || `${getGcsBaseUrl()}/gold/rag/index.json`

export const getFinancialReturnUrl = () =>
  process.env.FINANCIAL_RETURN_URL || `${getGcsBaseUrl()}/processed/latest/financial_return.json`

export const getOperatingBudgetUrl = () =>
  process.env.OPERATING_BUDGET_URL || `${getGcsBaseUrl()}/processed/latest/operating_budget.json`

export const getCapitalDataUrl = () =>
  process.env.CAPITAL_DATA_URL || `${getGcsBaseUrl()}/processed/latest/capital_by_ward.json`

export const getVotingDataUrl = () =>
  process.env.VOTING_DATA_URL || `${getGcsBaseUrl()}/processed/latest/council_voting.json`

export const getLobbyistDataUrl = () =>
  process.env.LOBBYIST_DATA_URL || `${getGcsBaseUrl()}/processed/latest/lobbyist_activity.json`

export const getWardGeoJsonUrl = () =>
  process.env.WARD_GEOJSON_URL || `${getGcsBaseUrl()}/ward-boundaries/ward_boundaries.geojson`
