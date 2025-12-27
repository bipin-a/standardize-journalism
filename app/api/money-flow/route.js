import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadJsonData } from '../_lib/load-json'
import { getMoneyFlowIndexUrl, getFinancialReturnUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/financial_return.json'
const LOCAL_GOLD_INDEX_PATH = 'data/gold/money-flow/index.json'
const GROUP_LIMIT = 7

const loadLocalJson = async (localPath) => {
  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}

const fetchJson = async (url) => {
  const response = await fetch(url, { next: { revalidate } })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.json()
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
    bottomGroups: addPercentages(bottomGroups)
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
      return Response.json({
        error: 'No money flow data available',
        availableYears
      }, { status: 404 })
    }

    const year = Number.isFinite(requestedYear)
      ? requestedYear
      : latestYear

    if (!availableYears.includes(year)) {
      return Response.json({
        error: `No money flow data available for ${year}`,
        availableYears
      }, { status: 404 })
    }

    // Try loading pre-aggregated gold summary first
    try {
      const goldSummary = await loadMoneyFlowGold(year, goldIndex)
      if (goldSummary && goldSummary.revenue) {
        // Gold file exists and has expected shape - return it directly
        return Response.json(goldSummary)
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

    return Response.json({
      year,
      availableYears,
      revenue,
      expenditure,
      balance: {
        amount: balanceAmount,
        isSurplus: balanceAmount >= 0,
        percentageOfRevenue: revenue.total > 0 ? (balanceAmount / revenue.total) * 100 : 0
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
