import { loadProcessedFile } from '../_lib/data-loader'
import { CATEGORY_RULES } from '../../data/budget-category-rules'

export const revalidate = 3600

const normalizeText = (value) => (value ? String(value).toLowerCase() : '')

const sumPlanned = (records) => {
  let total = 0
  for (const record of records) {
    if (normalizeText(record.expense_revenue) !== 'expenses') {
      continue
    }
    const amount = Number(record.amount)
    if (Number.isFinite(amount)) {
      total += amount
    }
  }
  return total
}

const sumActual = (records) => {
  let total = 0
  for (const record of records) {
    if (record.flow_type !== 'expenditure') {
      continue
    }
    const amount = Number(record.amount)
    if (Number.isFinite(amount)) {
      total += amount
    }
  }
  return total
}

const matchesKeywords = (text, keywords) =>
  keywords.some((keyword) => text.includes(keyword))

const aggregatePlannedCategory = (records, keywords) => {
  let total = 0
  for (const record of records) {
    if (normalizeText(record.expense_revenue) !== 'expenses') {
      continue
    }
    const haystack = [
      normalizeText(record.program),
      normalizeText(record.service),
      normalizeText(record.activity)
    ].join(' ')
    if (!matchesKeywords(haystack, keywords)) {
      continue
    }
    const amount = Number(record.amount)
    if (Number.isFinite(amount)) {
      total += amount
    }
  }
  return total
}

const aggregateActualCategory = (records, keywords) => {
  let total = 0
  for (const record of records) {
    if (record.flow_type !== 'expenditure') {
      continue
    }
    const label = normalizeText(record.label || record.line_description)
    if (!matchesKeywords(label, keywords)) {
      continue
    }
    const amount = Number(record.amount)
    if (Number.isFinite(amount)) {
      total += amount
    }
  }
  return total
}

const buildCategories = (plannedRecords, actualRecords) => {
  const categories = CATEGORY_RULES.map((rule) => {
    const planned = aggregatePlannedCategory(plannedRecords, rule.plannedKeywords)
    const actual = aggregateActualCategory(actualRecords, rule.actualKeywords)
    const variance = actual - planned
    const variancePct = planned > 0 ? (variance / planned) * 100 : null
    return {
      name: rule.name,
      planned,
      actual,
      variance,
      variancePct
    }
  }).filter((item) => item.planned > 0)

  const plannedCovered = categories.reduce((sum, item) => sum + (item.planned || 0), 0)
  const actualCovered = categories.reduce((sum, item) => sum + (item.actual || 0), 0)

  return {
    categories: categories.sort((a, b) => b.actual - a.actual),
    coverage: { plannedCovered, actualCovered }
  }
}

const getAvailableYears = (records) => {
  const years = new Set()
  for (const record of records || []) {
    const year = Number(record.fiscal_year)
    if (Number.isFinite(year)) {
      years.add(year)
    }
  }
  return Array.from(years)
}

const pickLatestYear = (records) => {
  const years = getAvailableYears(records)
  if (!years.length) return null
  return Math.max(...years)
}

const filterByYear = (records, year) => {
  if (!year || !records) return []
  return records.filter((record) => Number(record.fiscal_year) === Number(year))
}

const buildCapitalRevision = (records, targetYear) => {
  if (!records || !records.length || !targetYear) {
    return null
  }

  const totalsByPlanYear = new Map()
  for (const record of records) {
    const baseYear = Number(record.fiscal_year)
    const offset = Number(record.year_offset)
    const amount = Number(record.amount)
    if (!Number.isFinite(baseYear) || !Number.isFinite(offset) || !Number.isFinite(amount)) {
      continue
    }
    const recordTarget = baseYear + offset - 1
    if (recordTarget !== targetYear) {
      continue
    }
    totalsByPlanYear.set(baseYear, (totalsByPlanYear.get(baseYear) || 0) + amount)
  }

  const planYears = Array.from(totalsByPlanYear.keys()).sort((a, b) => a - b)
  if (planYears.length < 2) {
    return null
  }

  const latestPlanYear = planYears[planYears.length - 1]
  const previousPlanYear = planYears[planYears.length - 2]
  const latestAmount = totalsByPlanYear.get(latestPlanYear) || 0
  const previousAmount = totalsByPlanYear.get(previousPlanYear) || 0
  const revision = latestAmount - previousAmount
  const revisionPct = previousAmount > 0 ? (revision / previousAmount) * 100 : null

  return {
    targetYear,
    previousPlanYear,
    latestPlanYear,
    previousAmount,
    latestAmount,
    revision,
    revisionPct
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number.parseInt(searchParams.get('year'), 10)

    const plannedYearTarget = Number.isFinite(requestedYear) ? requestedYear : null
    const actualYearTarget = Number.isFinite(requestedYear) ? requestedYear : null

    let plannedRecords = await loadProcessedFile('operating-budget', plannedYearTarget, { fallbackToLatest: false })
    let actualRecords = await loadProcessedFile('money-flow', actualYearTarget, { fallbackToLatest: false })

    let plannedYear = plannedYearTarget
    let actualYear = actualYearTarget
    let plannedFellBack = false
    let actualFellBack = false

    if (!plannedYearTarget && plannedRecords) {
      plannedYear = pickLatestYear(plannedRecords)
      plannedRecords = filterByYear(plannedRecords, plannedYear)
    }

    if (!actualYearTarget && actualRecords) {
      actualYear = pickLatestYear(actualRecords)
      actualRecords = filterByYear(actualRecords, actualYear)
    }

    if (!plannedRecords) {
      const plannedLatest = await loadProcessedFile('operating-budget', null, { fallbackToLatest: true })
      plannedYear = pickLatestYear(plannedLatest)
      plannedRecords = filterByYear(plannedLatest, plannedYear)
      plannedFellBack = Boolean(plannedYearTarget)
    }

    if (!actualRecords) {
      const actualLatest = await loadProcessedFile('money-flow', null, { fallbackToLatest: true })
      actualYear = pickLatestYear(actualLatest)
      actualRecords = filterByYear(actualLatest, actualYear)
      actualFellBack = Boolean(actualYearTarget)
    }

    const capitalRecords = await loadProcessedFile('capital', null, { fallbackToLatest: true })

    if (!plannedRecords || !actualRecords || !plannedRecords.length || !actualRecords.length) {
      return Response.json(
        { error: 'Budget vs actual data unavailable' },
        { status: 404 }
      )
    }

    const year = Number.isFinite(requestedYear)
      ? requestedYear
      : plannedYear || actualYear

    const plannedTotal = sumPlanned(plannedRecords)
    const actualTotal = sumActual(actualRecords)
    const variance = actualTotal - plannedTotal
    const variancePct = plannedTotal > 0 ? (variance / plannedTotal) * 100 : null
    const adherencePct = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : null

    const { categories, coverage } = buildCategories(plannedRecords, actualRecords)
    const plannedCoveragePct = plannedTotal > 0 ? (coverage.plannedCovered / plannedTotal) * 100 : null
    const actualCoveragePct = actualTotal > 0 ? (coverage.actualCovered / actualTotal) * 100 : null

    const capitalRevision = buildCapitalRevision(capitalRecords || [], year)

    return Response.json({
      year,
      requestedYear: Number.isFinite(requestedYear) ? requestedYear : null,
      plannedYear,
      actualYear,
      plannedFellBack,
      actualFellBack,
      plannedTotal,
      actualTotal,
      variance,
      variancePct,
      adherencePct,
      categories,
      categoryCoverage: {
        plannedCovered: coverage.plannedCovered,
        actualCovered: coverage.actualCovered,
        plannedPct: plannedCoveragePct,
        actualPct: actualCoveragePct
      },
      capitalRevision
    })
  } catch (error) {
    return Response.json(
      { error: error.message || 'Failed to compute budget vs actual' },
      { status: 500 }
    )
  }
}
