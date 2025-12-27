import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadJsonData } from '../_lib/load-json'
import { getCapitalIndexUrl, getCapitalDataUrl } from '../_lib/gcs-urls'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/capital_by_ward.json'
const LOCAL_GOLD_INDEX_PATH = 'data/gold/capital/index.json'

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

const loadCapitalIndex = async () => {
  const indexUrl = getCapitalIndexUrl()
  if (indexUrl) {
    try {
      return await fetchJson(indexUrl)
    } catch (error) {
      console.warn('Gold index fetch failed, trying local index:', error.message)
    }
  }
  return loadLocalJson(LOCAL_GOLD_INDEX_PATH)
}

const loadCapitalGold = async (year, index) => {
  const localPath = `data/gold/capital/${year}.json`
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

const loadCapitalProcessed = async () => {
  // Load full processed dataset for aggregation
  return loadJsonData({
    url: getCapitalDataUrl(),
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate,
    cacheMode: 'no-store' // Avoid cache limit on large files
  })
}

const aggregateByWard = (records) => {
  const wardTotals = new Map()

  for (const record of records) {
    const wardKey = `${record.ward_number}|${record.ward_name}`
    const current = wardTotals.get(wardKey) ?? {
      ward_number: record.ward_number,
      ward_name: record.ward_name,
      totalAmount: 0,
      projectCount: 0,
      categories: new Map()
    }

    current.totalAmount += record.amount
    current.projectCount += 1

    // Track spending by category
    if (record.category) {
      const categoryAmount = current.categories.get(record.category) ?? 0
      current.categories.set(record.category, categoryAmount + record.amount)
    }

    wardTotals.set(wardKey, current)
  }

  return Array.from(wardTotals.values())
    .map(ward => ({
      ward_number: ward.ward_number,
      ward_name: ward.ward_name,
      totalAmount: ward.totalAmount,
      projectCount: ward.projectCount,
      topCategory: ward.categories.size > 0
        ? Array.from(ward.categories.entries())
            .sort((a, b) => b[1] - a[1])[0][0]
        : null
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

const aggregateByCategory = (records) => {
  const categoryTotals = new Map()

  for (const record of records) {
    if (!record.category) continue

    const current = categoryTotals.get(record.category) ?? {
      name: record.category,
      totalAmount: 0,
      projectCount: 0
    }

    current.totalAmount += record.amount
    current.projectCount += 1

    categoryTotals.set(record.category, current)
  }

  return Array.from(categoryTotals.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

const getTopProjects = (records, limit = 10) => {
  const projectMap = new Map()

  for (const record of records) {
    if (!record.project_name) continue

    const key = `${record.project_name}|${record.ward_name}`
    const current = projectMap.get(key) ?? {
      project_name: record.project_name,
      ward_name: record.ward_name,
      ward_number: record.ward_number,
      program_name: record.program_name,
      category: record.category,
      amount: 0
    }

    current.amount += record.amount
    projectMap.set(key, current)
  }

  return Array.from(projectMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)

    let availableYears = []
    let latestYear = null
    let goldIndex = null
    let allRecords = null

    try {
      goldIndex = await loadCapitalIndex()
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
      allRecords = await loadCapitalProcessed()
      availableYears = [...new Set(allRecords.map(r => r.fiscal_year))].sort((a, b) => a - b)
      latestYear = availableYears[availableYears.length - 1]
    }
    if (availableYears.length === 0) {
      return Response.json({
        error: 'No capital budget data available',
        availableYears
      }, { status: 404 })
    }

    const year = Number.isFinite(requestedYear) && availableYears.includes(requestedYear)
      ? requestedYear
      : latestYear

    // Try loading pre-aggregated gold summary first
    try {
      const goldSummary = await loadCapitalGold(year, goldIndex)
      if (goldSummary && goldSummary.topWards) {
        // Gold file exists and has expected shape - return it directly
        return Response.json(goldSummary)
      }
    } catch (goldError) {
      console.warn(`Gold summary unavailable for ${year}, falling back to aggregation:`, goldError.message)
    }

    // Fallback: aggregate from processed data (original behavior)
    if (!allRecords) {
      allRecords = await loadCapitalProcessed()
    }
    const yearRecords = allRecords.filter(r => r.fiscal_year === year)

    if (yearRecords.length === 0) {
      return Response.json({
        error: `No capital budget data available for ${year}`,
        availableYears
      }, { status: 404 })
    }

    // Separate City Wide from ward-specific
    const cityWideRecords = yearRecords.filter(r => r.ward_number === 0)
    const wardRecords = yearRecords.filter(r => r.ward_number !== 0)

    // Aggregate by ward
    const wardTotals = aggregateByWard(wardRecords)
    const cityWideTotal = cityWideRecords.reduce((sum, r) => sum + r.amount, 0)

    // Calculate totals
    const wardSpecificTotal = wardTotals.reduce((sum, w) => sum + w.totalAmount, 0)
    const grandTotal = wardSpecificTotal + cityWideTotal

    // Get top and bottom wards
    const topWards = wardTotals.slice(0, 5)
    const bottomWards = wardTotals.slice(-5).reverse()

    // Calculate concentration metrics
    const top1Share = wardTotals.length > 0
      ? (wardTotals[0].totalAmount / wardSpecificTotal) * 100
      : 0
    const top5Share = topWards.length > 0
      ? (topWards.reduce((sum, w) => sum + w.totalAmount, 0) / wardSpecificTotal) * 100
      : 0
    const disparityRatio = wardTotals.length > 1
      ? wardTotals[0].totalAmount / wardTotals[wardTotals.length - 1].totalAmount
      : 1

    // Category breakdown (ward-specific only)
    const categoryBreakdown = aggregateByCategory(wardRecords)

    // Top projects across all wards
    const topProjects = getTopProjects(wardRecords, 10)

    return Response.json({
      year,
      totalInvestment: grandTotal,
      wardSpecificInvestment: wardSpecificTotal,
      cityWideInvestment: cityWideTotal,
      wardCount: wardTotals.length,
      cityWideProjectCount: cityWideRecords.length,
      topWards,
      bottomWards,
      allWards: wardTotals, // Include all ward totals for mapping/visualization
      categoryBreakdown: categoryBreakdown.slice(0, 5),
      topProjects,
      governance: {
        top1WardShare: top1Share,
        top5WardShare: top5Share,
        disparityRatio: disparityRatio
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Capital by Ward API error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
