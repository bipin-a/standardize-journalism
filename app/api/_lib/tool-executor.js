import { loadProcessedFile, loadTrendsFile } from './data-loader'
import { applyFilters, resolveYearList } from './tool-helpers'
import { getProcurementMetrics } from './metric-data'
import CITY_BUDGET_GLOSSARY from '../../data/city_budget_glossary.json'
import { lookupWebSources } from './web-lookup'

const MEETING_PATTERN = /\bmeeting(s)?\b/i
const REGISTRATION_PATTERN = /\bregistration(s)?\b/i
const CATEGORY_PATTERN = /\bcategory|categories\b/i
const PROGRAM_PATTERN = /\bprogram\b/i
const COUNCILLOR_PATTERN = /\bcouncillor\b/i
const SUBJECT_PATTERN = /\bsubject\b/i
const WARD_PATTERN = /\bward\b/i
const PASS_RATE_PATTERN = /\bpass rate\b/i
const PASSED_PATTERN = /\bpassed\b/i
const FAILED_PATTERN = /\bfailed\b/i
const MOTION_YEAR_PATTERN = /\b(20\d{2})\b/

export async function executeTool(toolName, params) {
  switch (toolName) {
    case 'count_records':
      return executeCount(params)
    case 'sum_amount':
      return executeSum(params)
    case 'budget_balance':
      return executeBudgetBalance(params)
    case 'compare_years':
      return executeCompare(params)
    case 'top_k':
      return executeTopK(params)
    case 'procurement_metrics':
      return executeProcurementMetrics(params)
    case 'get_motion_details':
      return executeMotionDetails(params)
    case 'council_metrics':
      return executeCouncilMetrics(params)
    case 'glossary_lookup':
      return executeGlossaryLookup(params)
    case 'web_lookup':
      return executeWebLookup(params)
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

const normalizeGlossaryText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const findGlossaryEntry = (query) => {
  const normalized = normalizeGlossaryText(query)
  if (!normalized) {
    return null
  }

  let bestMatch = null
  let bestLength = 0

  CITY_BUDGET_GLOSSARY.forEach((entry) => {
    const terms = [entry.term, ...(entry.matches || [])]
      .map(normalizeGlossaryText)
      .filter(Boolean)
    terms.forEach((term) => {
      if (normalized === term) {
        if (term.length > bestLength) {
          bestMatch = entry
          bestLength = term.length
        }
        return
      }
      if (normalized.includes(term) && term.length > bestLength) {
        bestMatch = entry
        bestLength = term.length
      }
    })
  })

  return bestMatch
}

const extractGlossaryQuery = (params) => {
  if (params?.term) {
    return params.term
  }
  const message = params?.message || ''
  if (!message) return ''
  return message
}

async function executeGlossaryLookup(params) {
  const query = extractGlossaryQuery(params)
  const entry = findGlossaryEntry(query)

  if (!entry) {
    return {
      tool: 'glossary_lookup',
      dataset: 'glossary',
      result: null,
      source: 'glossary',
      failureReason: 'no_glossary_match',
      failureDetail: query ? `No glossary match for "${query}".` : 'No glossary query provided.'
    }
  }

  return {
    tool: 'glossary_lookup',
    dataset: 'glossary',
    result: {
      id: entry.id,
      term: entry.term,
      definition: entry.definition,
      details: entry.details || null
    },
    sources: entry.sources || [],
    source: 'glossary'
  }
}

const extractUrlFromText = (text = '') => {
  const match = String(text).match(/https?:\/\/[^\s)]+/i)
  if (!match) return null
  return match[0].replace(/[.,)]+$/, '')
}

async function executeWebLookup(params) {
  const message = params?.message || ''
  const query = params?.query || message
  const url = params?.url || extractUrlFromText(message)
  const conversationId = params?.conversationId || null

  // Query construction is handled by the tool router LLM
  // No hardcoded pattern matching for query enhancement
  const { result, sources, failureReason, failureDetail } = await lookupWebSources({
    query,
    url,
    conversationId
  })

  if (!result) {
    return {
      tool: 'web_lookup',
      dataset: 'web',
      result: null,
      sources: [],
      source: 'web',
      failureReason: failureReason || 'web_lookup_failed',
      failureDetail: failureDetail || 'Web lookup returned no results.'
    }
  }

  return {
    tool: 'web_lookup',
    dataset: 'web',
    result,
    sources,
    source: 'web'
  }
}

function inferRecordType(dataset, message = '') {
  const lower = message.toLowerCase()
  if (dataset === 'council') {
    return MEETING_PATTERN.test(lower) ? 'meetings' : 'motions'
  }
  if (dataset === 'lobbyist') {
    return REGISTRATION_PATTERN.test(lower) ? 'registrations' : 'activities'
  }
  return 'projects'
}

function inferGroupBy(dataset, message = '', filters = {}) {
  const lower = message.toLowerCase()
  if (filters.ward || WARD_PATTERN.test(lower)) return 'ward'
  if (filters.category || CATEGORY_PATTERN.test(lower)) return 'category'
  if (PROGRAM_PATTERN.test(lower)) return 'program'
  if (COUNCILLOR_PATTERN.test(lower)) return 'councillor'
  if (SUBJECT_PATTERN.test(lower)) return 'subject'
  if (dataset === 'capital') return 'ward'
  return 'total'
}

function inferCompareMetric(dataset, message = '') {
  const lower = message.toLowerCase()
  if (dataset === 'council') {
    if (MEETING_PATTERN.test(lower)) return 'meeting_count'
    if (/\bpass rate\b/i.test(lower)) return 'pass_rate'
    return 'count'
  }
  if (dataset === 'lobbyist') {
    return REGISTRATION_PATTERN.test(lower) ? 'registrations' : 'count'
  }
  return 'total'
}

function inferTopKMetric(dataset) {
  if (dataset === 'capital') return 'spending'
  if (dataset === 'council') return 'motions'
  if (dataset === 'lobbyist') return 'activity'
  if (dataset === 'money-flow') return 'spending'
  return 'count'
}

function inferCouncilMetric(message = '') {
  const lower = message.toLowerCase()
  if (PASS_RATE_PATTERN.test(lower)) return 'pass_rate'
  if (MEETING_PATTERN.test(lower)) return 'meeting_count'
  if (PASSED_PATTERN.test(lower)) return 'motions_passed'
  if (FAILED_PATTERN.test(lower)) return 'motions_failed'
  return 'total_motions'
}

function normalizeYears(years) {
  if (!Array.isArray(years)) return []
  return years.map((year) => Number(year)).filter((year) => Number.isFinite(year))
}

async function executeCount(params) {
  const dataset = params.dataset
  const recordType = params.recordType || inferRecordType(dataset, params.message)
  const trends = await loadTrendsFile(dataset)
  const yearList = resolveYearList({
    years: normalizeYears(params.years),
    windowYears: params.windowYears,
    trends
  })

  if (!trends || !yearList.length) {
    return executeCountFromProcessed({ ...params, recordType, years: yearList })
  }

  let total = 0
  for (const year of yearList) {
    const yearKey = String(year)
    if (dataset === 'council') {
      const stats = trends.byYear?.[yearKey] || {}
      if (recordType === 'meetings') total += Number(stats.meeting_count || 0)
      else total += Number(stats.total_motions || 0)
    } else if (dataset === 'lobbyist') {
      if (recordType === 'registrations') {
        total += Number(trends.registrationsByYear?.[yearKey] || 0)
      } else {
        total += Number(trends.activityByYear?.[yearKey] || 0)
      }
    }
  }

  return {
    tool: 'count_records',
    dataset,
    recordType,
    years: yearList,
    result: total,
    source: 'trends',
    dataTimestamp: trends.timestamp,
    filters: params.filters
  }
}

async function executeCountFromProcessed(params) {
  const dataset = params.dataset
  const resolvedYears = params.years?.length
    ? params.years
    : resolveYearList({ years: [], windowYears: params.windowYears, trends: await loadTrendsFile(dataset) })
  const yearList = resolvedYears.length ? resolvedYears : [null]
  const usedLatest = resolvedYears.length === 0

  let total = 0
  for (const year of yearList) {
    const data = await loadProcessedFile(dataset, year)
    if (!Array.isArray(data)) continue
    let filtered = data
    if (dataset !== 'money-flow') {
      filtered = applyFilters(data, params.filters)
    }

    if (dataset === 'lobbyist' && params.recordType === 'registrations') {
      const seen = new Set()
      for (const record of filtered) {
        const key = record.sm_number || `${record.lobbyist_name || ''}|${record.client_name || ''}|${record.registration_date || ''}`
        if (key) seen.add(key)
      }
      total += seen.size
    } else {
      total += filtered.length
    }
  }

  return {
    tool: 'count_records',
    dataset,
    recordType: params.recordType,
    years: resolvedYears,
    result: total,
    source: 'processed',
    usedLatest,
    filters: params.filters
  }
}

async function executeSum(params) {
  const dataset = params.dataset
  const groupBy = params.groupBy || inferGroupBy(dataset, params.message, params.filters)
  const trends = await loadTrendsFile(dataset)
  const yearList = resolveYearList({
    years: normalizeYears(params.years),
    windowYears: params.windowYears,
    trends
  })

  const hasCombinedFilters = params.filters?.ward && params.filters?.category
  if (dataset === 'capital' && hasCombinedFilters) {
    return executeSumFromProcessed({ ...params, groupBy, years: yearList })
  }

  if (!trends || !yearList.length) {
    return executeSumFromProcessed({ ...params, groupBy, years: yearList })
  }

  if (dataset === 'capital') {
    if (groupBy === 'total' || !groupBy) {
      const total = yearList.reduce((sum, year) => sum + Number(trends.totalByYear?.[year] || 0), 0)
      return {
        tool: 'sum_amount',
        dataset,
        groupBy: 'total',
        years: yearList,
        result: total,
        source: 'trends',
        dataTimestamp: trends.timestamp,
        filters: params.filters
      }
    }

    if (groupBy === 'ward' && params.filters?.ward && Array.isArray(trends.wards)) {
      const ward = trends.wards.find((item) => Number(item.ward_number) === Number(params.filters.ward))
      if (ward) {
        const total = yearList.reduce((sum, year) => sum + Number(ward.byYear?.[year] || 0), 0)
        return {
          tool: 'sum_amount',
          dataset,
          groupBy: 'ward',
          years: yearList,
          ward: ward.ward_number,
          wardName: ward.ward_name,
          result: total,
          source: 'trends',
          dataTimestamp: trends.timestamp,
          filters: params.filters
        }
      }
    }

    if (groupBy === 'category' && params.filters?.category && Array.isArray(trends.categories)) {
      const target = String(params.filters.category).toLowerCase()
      const category = trends.categories.find((item) => String(item.name || '').toLowerCase().includes(target))
      if (category) {
        const total = yearList.reduce((sum, year) => sum + Number(category.byYear?.[year] || 0), 0)
        return {
          tool: 'sum_amount',
          dataset,
          groupBy: 'category',
          years: yearList,
          category: category.name,
          result: total,
          source: 'trends',
          dataTimestamp: trends.timestamp,
          filters: params.filters
        }
      }
    }
  }

  if (dataset === 'money-flow') {
    const flowType = params.flowType || 'expenditure'
    const flow = trends.flows?.[flowType]
    if (!flow) {
      return executeSumFromProcessed({ ...params, groupBy, years: yearList })
    }

    if (groupBy === 'total' || !groupBy) {
      const total = yearList.reduce((sum, year) => sum + Number(flow.totalByYear?.[year] || 0), 0)
      return {
        tool: 'sum_amount',
        dataset,
        flowType,
        groupBy: 'total',
        years: yearList,
        result: total,
        source: 'trends',
        dataTimestamp: trends.timestamp,
        filters: params.filters
      }
    }

    if (groupBy === 'label' && params.filters?.category) {
      const target = String(params.filters.category).toLowerCase()
      const labelEntry = Object.entries(flow.byLabel || {}).find(([label]) =>
        String(label).toLowerCase().includes(target)
      )
      if (labelEntry) {
        const [label, values] = labelEntry
        const total = yearList.reduce((sum, year) => sum + Number(values?.[year] || 0), 0)
        return {
          tool: 'sum_amount',
          dataset,
          flowType,
          groupBy: 'label',
          years: yearList,
          label,
          result: total,
          source: 'trends',
          dataTimestamp: trends.timestamp,
          filters: params.filters
        }
      }
    }
  }

  return executeSumFromProcessed({ ...params, groupBy, years: yearList })
}

async function executeSumFromProcessed(params) {
  const dataset = params.dataset
  const resolvedYears = params.years?.length
    ? params.years
    : resolveYearList({ years: [], windowYears: params.windowYears, trends: await loadTrendsFile(dataset) })
  const yearList = resolvedYears.length ? resolvedYears : [null]
  const usedLatest = resolvedYears.length === 0

  let total = 0
  for (const year of yearList) {
    const data = await loadProcessedFile(dataset, year)
    if (!Array.isArray(data)) continue

    let records = data
    if (dataset === 'money-flow') {
      if (params.flowType) {
        records = records.filter((record) => record.flow_type === params.flowType)
      }
      if (params.filters?.category) {
        const target = String(params.filters.category).toLowerCase()
        records = records.filter((record) => {
          const label = record.label || record.line_description || ''
          return String(label).toLowerCase().includes(target)
        })
      }
    } else {
      records = applyFilters(records, params.filters)
    }

    total += records.reduce((sum, record) => sum + Number(record.amount || 0), 0)
  }

  return {
    tool: 'sum_amount',
    dataset,
    groupBy: params.groupBy,
    years: resolvedYears,
    result: total,
    source: 'processed',
    usedLatest,
    filters: params.filters,
    flowType: params.flowType
  }
}

async function executeCompare(params) {
  const dataset = params.dataset
  const trends = await loadTrendsFile(dataset)
  const yearList = resolveYearList({
    years: normalizeYears(params.years),
    windowYears: params.windowYears,
    trends
  })

  if (yearList.length < 2) {
    throw new Error('compare_years requires at least 2 years')
  }

  const metric = params.metric || inferCompareMetric(dataset, params.message)
  const results = {}
  const missingYears = []

  if (trends && dataset === 'capital' && metric === 'total') {
    for (const year of yearList) {
      const value = trends.totalByYear?.[year]
      if (value === undefined) missingYears.push(year)
      else results[year] = value
    }
  } else if (trends && dataset === 'money-flow' && metric === 'total') {
    const flowType = params.flowType || 'expenditure'
    const flow = trends.flows?.[flowType]
    for (const year of yearList) {
      const value = flow?.totalByYear?.[year]
      if (value === undefined) missingYears.push(year)
      else results[year] = value
    }
  } else if (trends && dataset === 'council') {
    for (const year of yearList) {
      const stats = trends.byYear?.[String(year)] || {}
      if (metric === 'pass_rate') results[year] = Number(stats.pass_rate || 0)
      else if (metric === 'meeting_count') results[year] = Number(stats.meeting_count || 0)
      else results[year] = Number(stats.total_motions || 0)
    }
  } else if (trends && dataset === 'lobbyist') {
    for (const year of yearList) {
      const key = String(year)
      if (metric === 'registrations') {
        const value = trends.registrationsByYear?.[key]
        if (value === undefined) missingYears.push(year)
        else results[year] = value
      } else {
        const value = trends.activityByYear?.[key]
        if (value === undefined) missingYears.push(year)
        else results[year] = value
      }
    }
  } else {
    return executeCompareFromProcessed({ ...params, metric, years: yearList })
  }

  const sortedYears = [...yearList].sort((a, b) => a - b)
  const first = results[sortedYears[0]]
  const last = results[sortedYears[sortedYears.length - 1]]
  const change = Number(last || 0) - Number(first || 0)
  const changePercent = first ? ((change / first) * 100).toFixed(1) : null

  return {
    tool: 'compare_years',
    dataset,
    metric,
    years: sortedYears,
    results,
    change,
    changePercent,
    missingYears: missingYears.length ? missingYears : undefined,
    source: trends ? 'trends' : 'processed',
    dataTimestamp: trends?.timestamp,
    filters: params.filters,
    flowType: params.flowType
  }
}

async function executeCompareFromProcessed(params) {
  const dataset = params.dataset
  const results = {}

  for (const year of params.years || []) {
    const data = await loadProcessedFile(dataset, year)
    if (!Array.isArray(data)) continue

    let records = data
    if (dataset !== 'money-flow') {
      records = applyFilters(records, params.filters)
    }

    if (params.metric === 'total' || dataset === 'money-flow' || dataset === 'capital') {
      if (dataset === 'money-flow' && params.flowType) {
        records = records.filter((record) => record.flow_type === params.flowType)
      }
      results[year] = records.reduce((sum, record) => sum + Number(record.amount || 0), 0)
    } else {
      results[year] = records.length
    }
  }

  const sortedYears = [...Object.keys(results)].map(Number).sort((a, b) => a - b)
  const first = results[sortedYears[0]]
  const last = results[sortedYears[sortedYears.length - 1]]
  const change = Number(last || 0) - Number(first || 0)
  const changePercent = first ? ((change / first) * 100).toFixed(1) : null

  return {
    tool: 'compare_years',
    dataset,
    metric: params.metric,
    years: sortedYears,
    results,
    change,
    changePercent,
    source: 'processed',
    filters: params.filters,
    flowType: params.flowType
  }
}

async function executeTopK(params) {
  const dataset = params.dataset
  const trends = await loadTrendsFile(dataset)
  const groupBy = params.groupBy || (dataset === 'money-flow' ? 'label' : inferGroupBy(dataset, params.message, params.filters))
  const metric = params.metric || inferTopKMetric(dataset)
  const resolvedYears = resolveYearList({
    years: normalizeYears(params.years || (params.year ? [params.year] : [])),
    windowYears: params.windowYears,
    trends
  })
  const year = resolvedYears[resolvedYears.length - 1] || null
  const k = params.k || 5

  if (dataset === 'money-flow' && trends && groupBy === 'label') {
    const flowType = params.flowType || 'expenditure'
    const flow = trends.flows?.[flowType]
    if (flow && flow.byLabel && year) {
      const results = Object.entries(flow.byLabel)
        .map(([label, values]) => ({
          label,
          value: Number(values?.[year] || 0)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, k)

      return {
        tool: 'top_k',
        dataset,
        groupBy,
        metric,
        flowType,
        year,
        k,
        results,
        source: 'trends',
        dataTimestamp: trends.timestamp,
        filters: params.filters
      }
    }
  }

  if (trends && dataset === 'capital' && groupBy === 'ward' && Array.isArray(trends.wards)) {
    const targetYear = year || resolveYearList({ years: [], windowYears: null, trends })[0] || null
    const results = trends.wards
      .filter((ward) => ward.ward_number !== 0)
      .map((ward) => ({
        label: `Ward ${ward.ward_number} (${ward.ward_name})`,
        ward_number: ward.ward_number,
        ward_name: ward.ward_name,
        value: Number(ward.byYear?.[targetYear] || 0)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, k)

    return {
      tool: 'top_k',
      dataset,
      groupBy,
      metric,
      year: targetYear,
      k,
      results,
      source: 'trends',
      dataTimestamp: trends.timestamp,
      filters: params.filters
    }
  }

  if (trends && dataset === 'capital' && groupBy === 'category' && Array.isArray(trends.categories)) {
    const targetYear = year || resolveYearList({ years: [], windowYears: null, trends })[0] || null
    const results = trends.categories
      .map((category) => ({
        label: category.name,
        value: Number(category.byYear?.[targetYear] || 0)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, k)

    return {
      tool: 'top_k',
      dataset,
      groupBy,
      metric,
      year: targetYear,
      k,
      results,
      source: 'trends',
      dataTimestamp: trends.timestamp,
      filters: params.filters
    }
  }

  return executeTopKFromProcessed({ ...params, groupBy, metric, year, k })
}

async function executeTopKFromProcessed(params) {
  const dataset = params.dataset
  const trends = await loadTrendsFile(dataset)
  const resolvedYears = resolveYearList({
    years: normalizeYears(params.years || (params.year ? [params.year] : [])),
    windowYears: params.windowYears,
    trends
  })
  const year = resolvedYears[resolvedYears.length - 1] || null
  const k = params.k || 5
  const usedLatest = !year
  const data = await loadProcessedFile(dataset, year)
  if (!Array.isArray(data)) {
    return {
      tool: 'top_k',
      dataset,
      groupBy: params.groupBy,
      metric: params.metric,
      year,
      k,
      results: [],
      source: 'processed',
      usedLatest,
      filters: params.filters
    }
  }

  const aggregator = new Map()
  const addValue = (label, value, extra = {}) => {
    if (!label) return
    const current = aggregator.get(label) || { label, value: 0, ...extra }
    current.value += value
    aggregator.set(label, current)
  }

  for (const record of data) {
    if (dataset !== 'money-flow') {
      if (!applyFilters([record], params.filters).length) {
        continue
      }
    }

    if (params.groupBy === 'ward') {
      const label = `Ward ${record.ward_number} (${record.ward_name || 'Unknown'})`
      addValue(label, Number(record.amount || 0), {
        ward_number: record.ward_number,
        ward_name: record.ward_name
      })
      continue
    }

    if (params.groupBy === 'category') {
      const label = record.category || record.motion_category || record.subject_category || 'Unknown'
      addValue(label, Number(record.amount || 0) || 1)
      continue
    }

    if (params.groupBy === 'program') {
      const label = record.program_name || record.project_name || 'Unknown'
      addValue(label, Number(record.amount || 0) || 1)
      continue
    }

    if (params.groupBy === 'subject') {
      const label = record.subject_category || record.subject_matter || 'Unknown'
      addValue(label, 1)
      continue
    }

    if (params.groupBy === 'councillor' && Array.isArray(record.votes)) {
      for (const vote of record.votes) {
        const name = vote.councillor_name || 'Unknown'
        addValue(name, 1)
      }
      continue
    }
  }

  const results = Array.from(aggregator.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, k)

  return {
    tool: 'top_k',
    dataset,
    groupBy: params.groupBy,
    metric: params.metric,
    year,
    k,
    results,
    source: 'processed',
    usedLatest,
    filters: params.filters
  }
}

async function executeProcurementMetrics(params) {
  const year = params.year
    || (params.years && params.years[0])
    || (new Date().getFullYear() - 1)
  const mode = params.mode || 'all'
  const data = await getProcurementMetrics({ year })

  let result = data
  if (mode === 'competitive') result = { year, competitive: data.competitive, timestamp: data.timestamp }
  if (mode === 'noncompetitive') result = { year, nonCompetitive: data.nonCompetitive, timestamp: data.timestamp }

  return {
    tool: 'procurement_metrics',
    dataset: 'procurement',
    year,
    mode,
    result,
    source: 'ckan',
    dataTimestamp: data.timestamp
  }
}

async function executeBudgetBalance(params) {
  const trends = await loadTrendsFile('money-flow')
  const yearList = resolveYearList({
    years: normalizeYears(params.years || (params.year ? [params.year] : [])),
    windowYears: params.windowYears,
    trends
  })
  const year = yearList[yearList.length - 1] || null
  const usedLatest = !params.year && !(params.years && params.years.length) && !params.windowYears

  if (!trends || !year) {
    return {
      tool: 'budget_balance',
      dataset: 'money-flow',
      year,
      result: null,
      source: trends ? 'processed' : 'trends',
      usedLatest
    }
  }

  const revenue = Number(trends.flows?.revenue?.totalByYear?.[year] || 0)
  const expenditure = Number(trends.flows?.expenditure?.totalByYear?.[year] || 0)
  const balance = revenue - expenditure
  const balanceType = balance >= 0 ? 'surplus' : 'deficit'

  return {
    tool: 'budget_balance',
    dataset: 'money-flow',
    year,
    result: {
      revenue,
      expenditure,
      balance,
      balanceType
    },
    source: 'trends',
    dataTimestamp: trends.timestamp,
    usedLatest
  }
}

async function executeCouncilMetrics(params) {
  const trends = await loadTrendsFile('council')
  const resolvedYears = resolveYearList({
    years: normalizeYears(params.years || (params.year ? [params.year] : [])),
    windowYears: params.windowYears,
    trends
  })
  const year = resolvedYears[resolvedYears.length - 1] || (params.year ? Number(params.year) : null)
  const usedLatest = !params.year && !(params.years && params.years.length) && !params.windowYears
  const metric = params.metric || inferCouncilMetric(params.message)

  const getMetricValue = (stats) => {
    if (!stats) return null
    if (metric === 'pass_rate') {
      if (stats.pass_rate !== undefined && stats.pass_rate !== null) {
        return Number(stats.pass_rate)
      }
      const total = Number(stats.total_motions || 0)
      const passed = Number(stats.motions_passed || 0)
      return total ? (passed / total) * 100 : 0
    }
    if (metric === 'meeting_count') return Number(stats.meeting_count || 0)
    if (metric === 'motions_passed') return Number(stats.motions_passed || 0)
    if (metric === 'motions_failed') return Number(stats.motions_failed || 0)
    return Number(stats.total_motions || 0)
  }

  let source = 'trends'
  let value = null
  if (trends && year) {
    const stats = trends.byYear?.[String(year)] || null
    value = getMetricValue(stats)
  }

  if (value === null || Number.isNaN(value)) {
    source = 'processed'
    if (year) {
      const data = await loadProcessedFile('council', year)
      if (Array.isArray(data)) {
        const totalMotions = data.length
        const motionsPassed = data.filter((item) => item.vote_outcome === 'passed').length
        const motionsFailed = data.filter((item) => item.vote_outcome === 'failed').length
        const meetingCount = new Set(data.map((item) => item.meeting_date).filter(Boolean)).size
        const derived = {
          total_motions: totalMotions,
          motions_passed: motionsPassed,
          motions_failed: motionsFailed,
          meeting_count: meetingCount,
          pass_rate: totalMotions ? (motionsPassed / totalMotions) * 100 : 0
        }
        value = getMetricValue(derived)
      }
    }
  }

  return {
    tool: 'council_metrics',
    dataset: 'council',
    year,
    metric,
    result: value,
    source,
    dataTimestamp: trends?.timestamp,
    usedLatest
  }
}

async function executeMotionDetails(params) {
  const parseMotionYear = (motionId) => {
    if (!motionId) return null
    const match = String(motionId).match(MOTION_YEAR_PATTERN)
    if (!match) return null
    const year = Number(match[1])
    return Number.isFinite(year) ? year : null
  }

  const trends = await loadTrendsFile('council')
  const inferredYear = parseMotionYear(params.motionId)
  const explicitYears = normalizeYears(params.years || (params.year ? [params.year] : []))
  const requestedYears = explicitYears.length ? explicitYears : inferredYear ? [inferredYear] : []
  const resolvedYears = resolveYearList({
    years: requestedYears,
    windowYears: params.windowYears,
    trends
  })
  const yearList = resolvedYears.length ? resolvedYears : [null]
  const usedLatest = resolvedYears.length === 0

  const motionId = params.motionId
  const titleContains = params.titleContains

  for (const year of yearList) {
    const data = await loadProcessedFile('council', year)
    if (!Array.isArray(data)) continue

    const match = data.find((motion) => {
      if (motionId && String(motion.motion_id).toLowerCase() === String(motionId).toLowerCase()) {
        return true
      }
      if (titleContains && String(motion.motion_title || '').toLowerCase().includes(String(titleContains).toLowerCase())) {
        return true
      }
      return false
    })

    if (match) {
      const agendaTitle = match.agenda_item_title || match.motion_title || null
      const voteDescription = match.vote_description || null
      const motionText = [agendaTitle, voteDescription].filter(Boolean).join(' — ')

      // Build vote breakdown if available
      let voteBreakdown = null
      if (Array.isArray(match.votes) && match.votes.length > 0) {
        const yesVotes = match.votes.filter(v => (v.final_vote || '').toLowerCase() === 'yes')
        const noVotes = match.votes.filter(v => (v.final_vote || '').toLowerCase() === 'no')
        const absentVotes = match.votes.filter(v => {
          const voteVal = (v.final_vote || '').toLowerCase()
          return voteVal === 'absent' || voteVal === ''
        })
        voteBreakdown = {
          inFavour: yesVotes.map(v => v.councillor_name),
          against: noVotes.map(v => v.councillor_name),
          absent: absentVotes.map(v => v.councillor_name)
        }
      }

      // Explain why motion failed
      let failureExplanation = null
      if (match.vote_outcome === 'failed' && voteBreakdown) {
        const totalPresent = voteBreakdown.inFavour.length + voteBreakdown.against.length
        const majorityNeeded = Math.floor(totalPresent / 2) + 1
        failureExplanation = `This motion failed because it did not receive the required majority. It needed ${majorityNeeded} votes to pass but only received ${voteBreakdown.inFavour.length}.`
      }

      return {
        tool: 'get_motion_details',
        dataset: 'council',
        year,
        result: {
          motion_id: match.motion_id,
          motion_title: match.motion_title,
          agenda_item_title: match.agenda_item_title || null,
          vote_description: match.vote_description || null,
          motion_text: motionText || match.motion_title,
          meeting_date: match.meeting_date,
          vote_outcome: match.vote_outcome,
          vote_margin: match.vote_margin,
          yes_votes: match.yes_votes,
          no_votes: match.no_votes,
          absent_votes: match.absent_votes,
          voteBreakdown,
          failureExplanation
        },
        source: 'processed',
        dataTimestamp: match.ingested_at,
        usedLatest,
        query: {
          motionId,
          titleContains
        }
      }
    }
  }

  return {
    tool: 'get_motion_details',
    dataset: 'council',
    years: resolvedYears,
    result: null,
    source: 'processed',
    dataTimestamp: trends?.timestamp,
    usedLatest,
    query: {
      motionId,
      titleContains
    },
    failureReason: 'motion_not_found',
    failureDetail: JSON.stringify({
      motionId,
      titleContains,
      yearsTried: yearList
    })
  }
}
