import { loadJsonData } from '../_lib/load-json'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/financial_return.json'
const GROUP_LIMIT = 7

const loadMoneyFlowData = async () => {
  return loadJsonData({
    envKey: 'FINANCIAL_RETURN_URL',
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate
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

    const data = await loadMoneyFlowData()
    const availableYears = [...new Set(data.map(record => Number(record.fiscal_year)))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b)

    if (availableYears.length === 0) {
      return Response.json({
        error: 'No money flow data available',
        availableYears
      }, { status: 404 })
    }

    const year = Number.isFinite(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1]

    if (!availableYears.includes(year)) {
      return Response.json({
        error: `No money flow data available for ${year}`,
        availableYears
      }, { status: 404 })
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
