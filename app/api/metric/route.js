export const revalidate = 3600

const CKAN_BASE_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search'
const AWARDED_RESOURCE_ID = 'e211f003-5909-4bea-bd96-d75899d8e612'
const NON_COMPETITIVE_RESOURCE_ID = 'a11b18b4-72e6-47e3-a4e9-05dcc8abd697'
const PAGE_LIMIT = 1000

const AWARDED_FIELDS = {
  amount: 'Awarded Amount',
  date: 'Award Date',
  vendor: 'Successful Supplier',
  division: 'Division',
  category: 'High Level Category'
}

const NON_COMPETITIVE_FIELDS = {
  amount: 'Contract Amount',
  date: 'Contract Date'
}

const fetchJson = async (url) => {
  const response = await fetch(url, { next: { revalidate } })
  const data = await response.json()
  if (!data?.success) {
    throw new Error('Failed to fetch from Toronto Open Data')
  }
  return data
}

const parseAmount = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.replace(/[$,]/g, '').trim()
  if (!normalized) {
    return null
  }
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const getYearFromValue = (value) => {
  if (!value) {
    return null
  }
  const text = String(value)
  const year = Number.parseInt(text.slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}

const fetchAllRecords = async (resourceId) => {
  let offset = 0
  let total = null
  const records = []

  while (true) {
    const url = `${CKAN_BASE_URL}?resource_id=${resourceId}&limit=${PAGE_LIMIT}&offset=${offset}`
    const data = await fetchJson(url)
    const pageRecords = data.result?.records ?? []

    if (total === null) {
      total = data.result?.total ?? pageRecords.length
    }

    records.push(...pageRecords)

    if (records.length >= total || pageRecords.length === 0) {
      break
    }

    offset += PAGE_LIMIT
  }

  return { records, total: total ?? records.length }
}

const filterByYear = (records, dateField, year) => {
  return records.filter((record) => getYearFromValue(record[dateField]) === year)
}

const summarizeTotals = (records, amountField) => {
  let totalValue = 0
  let contractCount = 0

  for (const record of records) {
    const amount = parseAmount(record[amountField])
    if (amount === null) {
      continue
    }
    totalValue += amount
    contractCount += 1
  }

  return { totalValue, contractCount }
}

const aggregateByField = (records, groupField, amountField) => {
  const totals = new Map()

  for (const record of records) {
    const label = record[groupField]
    if (!label || typeof label !== 'string') {
      continue
    }
    const amount = parseAmount(record[amountField])
    if (amount === null) {
      continue
    }

    const current = totals.get(label) ?? { name: label, totalValue: 0, count: 0 }
    current.totalValue += amount
    current.count += 1
    totals.set(label, current)
  }

  return Array.from(totals.values()).sort((a, b) => b.totalValue - a.totalValue)
}

const calculateMedian = (records, amountField) => {
  const amounts = []
  for (const record of records) {
    const amount = parseAmount(record[amountField])
    if (amount !== null) {
      amounts.push(amount)
    }
  }

  if (amounts.length === 0) {
    return null
  }

  amounts.sort((a, b) => a - b)
  const mid = Math.floor(amounts.length / 2)

  if (amounts.length % 2 === 0) {
    return (amounts[mid - 1] + amounts[mid]) / 2
  }
  return amounts[mid]
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)
    const year = Number.isFinite(requestedYear) ? requestedYear : 2024

    const [awardedData, nonCompetitiveData] = await Promise.all([
      fetchAllRecords(AWARDED_RESOURCE_ID),
      fetchAllRecords(NON_COMPETITIVE_RESOURCE_ID)
    ])

    const awardedYearRecords = filterByYear(awardedData.records, AWARDED_FIELDS.date, year)
    const awardedTotals = summarizeTotals(awardedYearRecords, AWARDED_FIELDS.amount)
    const topVendors = aggregateByField(
      awardedYearRecords,
      AWARDED_FIELDS.vendor,
      AWARDED_FIELDS.amount
    )
    const divisionBreakdown = aggregateByField(
      awardedYearRecords,
      AWARDED_FIELDS.division,
      AWARDED_FIELDS.amount
    ).slice(0, 8)
    const categoryBreakdown = aggregateByField(
      awardedYearRecords,
      AWARDED_FIELDS.category,
      AWARDED_FIELDS.amount
    ).slice(0, 10)

    const nonCompetitiveYearRecords = filterByYear(
      nonCompetitiveData.records,
      NON_COMPETITIVE_FIELDS.date,
      year
    )
    const nonCompetitiveTotals = summarizeTotals(
      nonCompetitiveYearRecords,
      NON_COMPETITIVE_FIELDS.amount
    )

    // Calculate vendor concentration metrics
    const competitiveTotal = awardedTotals.totalValue
    const top1Share = topVendors.length > 0
      ? (topVendors[0].totalValue / competitiveTotal) * 100
      : 0
    const top10Total = topVendors
      .slice(0, 10)
      .reduce((sum, v) => sum + v.totalValue, 0)
    const top10Share = competitiveTotal > 0
      ? (top10Total / competitiveTotal) * 100
      : 0

    // Calculate non-competitive share
    const grandTotal = competitiveTotal + nonCompetitiveTotals.totalValue
    const totalContracts = awardedTotals.contractCount + nonCompetitiveTotals.contractCount
    const nonCompetitiveAmountShare = grandTotal > 0
      ? (nonCompetitiveTotals.totalValue / grandTotal) * 100
      : 0
    const nonCompetitiveCountShare = totalContracts > 0
      ? (nonCompetitiveTotals.contractCount / totalContracts) * 100
      : 0

    // Calculate median award size
    const medianAwardSize = calculateMedian(awardedYearRecords, AWARDED_FIELDS.amount)

    return Response.json({
      year,
      competitive: {
        totalValue: awardedTotals.totalValue,
        contractCount: awardedTotals.contractCount,
        recordsFetched: awardedData.records.length,
        recordsUsed: awardedYearRecords.length,
        topVendors: topVendors.slice(0, 10),
        divisionBreakdown,
        categoryBreakdown,
        medianAwardSize,
        top1VendorShare: top1Share,
        top10VendorShare: top10Share
      },
      nonCompetitive: {
        totalValue: nonCompetitiveTotals.totalValue,
        contractCount: nonCompetitiveTotals.contractCount,
        recordsFetched: nonCompetitiveData.records.length,
        recordsUsed: nonCompetitiveYearRecords.length,
        amountShare: nonCompetitiveAmountShare,
        countShare: nonCompetitiveCountShare
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
