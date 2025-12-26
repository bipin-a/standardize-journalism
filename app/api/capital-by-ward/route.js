import { loadJsonData } from '../_lib/load-json'

export const revalidate = 3600

const LOCAL_DATA_PATH = 'data/processed/capital_by_ward.json'

const loadCapitalData = async () => {
  return loadJsonData({
    envKey: 'CAPITAL_DATA_URL',
    localPath: LOCAL_DATA_PATH,
    revalidateSeconds: revalidate
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
    const year = Number.isFinite(requestedYear) ? requestedYear : 2024

    const allRecords = await loadCapitalData()
    const yearRecords = allRecords.filter(r => r.fiscal_year === year)

    if (yearRecords.length === 0) {
      return Response.json({
        error: `No capital budget data available for ${year}`,
        availableYears: [...new Set(allRecords.map(r => r.fiscal_year))].sort()
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
