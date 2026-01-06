import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadJsonData } from '../_lib/load-json'
import { getMoneyFlowIndexUrl, getFinancialReturnUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/financial_return.json'
const LOCAL_TOTALS_PATH = 'data/processed/financial_return_totals.json'
const LOCAL_GOLD_INDEX_PATH = 'data/gold/money-flow/index.json'
const GROUP_LIMIT = 7
const CKAN_BASE_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action'
const CKAN_PACKAGE_ID = 'revenues-and-expenses'
const CKAN_DATASET_URL = 'https://open.toronto.ca/dataset/revenues-and-expenses/'

const loadLocalJson = async (localPath) => {
  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}

const loadLocalTotalsForYear = async (year) => {
  if (!Number.isFinite(year)) {
    return null
  }
  try {
    const totals = await loadLocalJson(LOCAL_TOTALS_PATH)
    const totalsByYear = totals?.years
    if (!totalsByYear || typeof totalsByYear !== 'object') {
      return null
    }
    return totalsByYear[String(year)] ?? null
  } catch (error) {
    return null
  }
}

const fetchJson = async (url) => {
  const response = await fetch(url, { next: { revalidate } })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.json()
}

const extractResourceYear = (resource) => {
  const text = [
    resource?.name,
    resource?.title,
    resource?.url
  ]
    .filter(Boolean)
    .join(' ')
  const match = text.match(/\b(20\d{2})\b/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  return Number.isFinite(year) ? year : null
}

const loadCkanSourceStatus = async (requestedYear) => {
  try {
    const response = await fetchJson(`${CKAN_BASE_URL}/package_show?id=${CKAN_PACKAGE_ID}`)
    const pkg = response?.result
    const resources = Array.isArray(pkg?.resources) ? pkg.resources : []
    const resourceYears = resources
      .map(extractResourceYear)
      .filter(Number.isFinite)
    const lastPublishedYear = resourceYears.length
      ? Math.max(...resourceYears)
      : null

    return {
      dataset: pkg?.title || 'Financial Information Return (Schedule 10 & 40)',
      datasetUrl: CKAN_DATASET_URL,
      lastModified: pkg?.metadata_modified || null,
      lastPublishedYear,
      requestedYear: Number.isFinite(requestedYear) ? requestedYear : null
    }
  } catch (error) {
    console.warn('CKAN metadata lookup failed:', error.message)
    return {
      dataset: 'Financial Information Return (Schedule 10 & 40)',
      datasetUrl: CKAN_DATASET_URL,
      lastModified: null,
      lastPublishedYear: null,
      requestedYear: Number.isFinite(requestedYear) ? requestedYear : null
    }
  }
}

const loadMoneyFlowIndex = async () => {
  const indexUrl = getMoneyFlowIndexUrl()
  if (indexUrl) {
    try {
      return await fetchJson(indexUrl)
    } catch (error) {
      console.warn('Gold index fetch failed, trying local index:', error.message)
    }
  }
  return loadLocalJson(LOCAL_GOLD_INDEX_PATH)
}

const loadMoneyFlowGold = async (year, index) => {
  const localPath = `data/gold/money-flow/${year}.json`
  try {
    return await loadLocalJson(localPath)
  } catch (error) {
    // Ignore local file errors and fall back to remote
  }

  const goldUrl = index?.files?.[String(year)]
  if (!goldUrl) {
    throw new Error(`No gold URL available for ${year}`)
  }
  return fetchJson(goldUrl)
}

const loadMoneyFlowProcessed = async () => {
  // Load full processed dataset for aggregation
  return loadJsonData({
    url: getFinancialReturnUrl(),
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store' // Avoid cache limit on large files
  })
}

const aggregateByLabel = (records) => {
  const totals = new Map()

  for (const record of records) {
    const label = record.label || record.line_description
    if (!label) continue

    const amount = Number(record.amount)
    if (!Number.isFinite(amount)) continue

    const current = totals.get(label) ?? { label, amount: 0 }
    current.amount += amount
    totals.set(label, current)
  }

  return Array.from(totals.values())
}

const buildTopBottomGroups = (records) => {
  const positive = records.filter(item => item.amount > 0)
  const sorted = positive.sort((a, b) => b.amount - a.amount)

  const topGroups = sorted.slice(0, GROUP_LIMIT)
  const topLabels = new Set(topGroups.map(group => group.label))
  const bottomGroups = sorted
    .slice(-GROUP_LIMIT)
    .filter(group => !topLabels.has(group.label))
    .sort((a, b) => a.amount - b.amount)

  const total = positive.reduce((sum, item) => sum + item.amount, 0)

  const addPercentages = (groups) => groups.map(group => ({
    ...group,
    percentage: total > 0 ? (group.amount / total) * 100 : 0
  }))

  return {
    total,
    topGroups: addPercentages(topGroups),
    bottomGroups: addPercentages(bottomGroups),
    allGroups: addPercentages(sorted)
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)

    let availableYears = []
    let latestYear = null
    let goldIndex = null
    let data = null

    try {
      goldIndex = await loadMoneyFlowIndex()
      if (Array.isArray(goldIndex?.availableYears)) {
        availableYears = goldIndex.availableYears
          .map(year => Number(year))
          .filter(Number.isFinite)
          .sort((a, b) => a - b)
        const latest = Number(goldIndex.latestYear)
        latestYear = Number.isFinite(latest) ? latest : availableYears[availableYears.length - 1]
      }
    } catch (error) {
      console.warn('Gold index unavailable, falling back to processed data:', error.message)
    }

    if (availableYears.length === 0) {
      data = await loadMoneyFlowProcessed()
      availableYears = [...new Set(data.map(record => Number(record.fiscal_year)))]
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      latestYear = availableYears[availableYears.length - 1]
    }

    if (availableYears.length === 0) {
      const sourceStatus = await loadCkanSourceStatus(requestedYear)
      return Response.json({
        error: 'No money flow data available',
        availableYears,
        sourceStatus
      }, { status: 404 })
    }

    const year = Number.isFinite(requestedYear)
      ? requestedYear
      : latestYear

    if (!availableYears.includes(year)) {
      const sourceStatus = await loadCkanSourceStatus(year)
      return Response.json({
        error: `No money flow data available for ${year}`,
        availableYears,
        sourceStatus
      }, { status: 404 })
    }

    // Try loading pre-aggregated gold summary first
    try {
      const goldSummary = await loadMoneyFlowGold(year, goldIndex)
      const hasAllGroups = Array.isArray(goldSummary?.revenue?.allGroups)
        && Array.isArray(goldSummary?.expenditure?.allGroups)

      if (goldSummary && goldSummary.revenue && goldSummary.expenditure && hasAllGroups) {
        // Gold file exists and has expected shape - return it directly
        return Response.json(goldSummary)
      }

      if (goldSummary && !hasAllGroups) {
        console.warn(`Gold summary missing allGroups for ${year}; falling back to aggregation.`)
      }
    } catch (goldError) {
      console.warn(`Gold summary unavailable for ${year}, falling back to aggregation:`, goldError.message)
    }

    // Fallback: aggregate from processed data (original behavior)
    if (!data) {
      data = await loadMoneyFlowProcessed()
    }
    const yearRecords = data.filter(record => record.fiscal_year === year)
    const revenueRecords = yearRecords.filter(record => record.flow_type === 'revenue')
    const expenseRecords = yearRecords.filter(record => record.flow_type === 'expenditure')

    const revenue = buildTopBottomGroups(aggregateByLabel(revenueRecords))
    const expenditure = buildTopBottomGroups(aggregateByLabel(expenseRecords))

    const balanceAmount = revenue.total - expenditure.total
    const reportedTotals = await loadLocalTotalsForYear(year)
    const reportedRevenueValue = reportedTotals?.reported_revenue_total
    const reportedExpenseValue = reportedTotals?.reported_expense_total
    const reportedRevenue = (reportedRevenueValue === null || reportedRevenueValue === undefined)
      ? null
      : Number(reportedRevenueValue)
    const reportedExpense = (reportedExpenseValue === null || reportedExpenseValue === undefined)
      ? null
      : Number(reportedExpenseValue)
    const safeReportedRevenue = Number.isFinite(reportedRevenue) ? reportedRevenue : null
    const safeReportedExpense = Number.isFinite(reportedExpense) ? reportedExpense : null
    const reportedBalance = (safeReportedRevenue !== null && safeReportedExpense !== null)
      ? safeReportedRevenue - safeReportedExpense
      : null

    revenue.lineItemTotal = revenue.total
    if (safeReportedRevenue !== null) {
      revenue.reportedTotal = safeReportedRevenue
    }

    expenditure.lineItemTotal = expenditure.total
    if (safeReportedExpense !== null) {
      expenditure.reportedTotal = safeReportedExpense
    }

    return Response.json({
      year,
      availableYears,
      revenue,
      expenditure,
      balance: {
        amount: balanceAmount,
        isSurplus: balanceAmount >= 0,
        percentageOfRevenue: revenue.total > 0 ? (balanceAmount / revenue.total) * 100 : 0,
        reported: reportedBalance !== null
          ? {
              amount: reportedBalance,
              isSurplus: reportedBalance >= 0,
              percentageOfRevenue: safeReportedRevenue
                ? (reportedBalance / safeReportedRevenue) * 100
                : 0
            }
          : null
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
