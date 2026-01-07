import { formatMoney } from './tool-helpers'
import {
  getCapitalDataUrl,
  getFinancialReturnUrl,
  getGcsBaseUrl,
  getLobbyistDataUrl,
  getVotingDataUrl
} from './gcs-urls'

const SCHEMA_VERSION = 1

const TOOL_RESPONSE_TYPES = {
  count_records: 'metric_count',
  sum_amount: 'metric_sum',
  budget_balance: 'budget_balance',
  compare_years: 'metric_compare',
  council_metrics: 'council_metrics',
  top_k: 'metric_rank',
  procurement_metrics: 'procurement_metrics',
  get_motion_details: 'motion_detail',
  glossary_lookup: 'glossary',
  web_lookup: 'web_lookup'
}

const DATASET_LABELS = {
  capital: 'Capital',
  'money-flow': 'Money Flow',
  council: 'Council Decisions',
  lobbyist: 'Lobbyist Registry',
  procurement: 'Procurement',
  glossary: 'Glossary',
  web: 'Web'
}

const API_ENDPOINTS = {
  capital: '/api/capital-by-ward',
  'money-flow': '/api/money-flow',
  council: '/api/council-decisions',
  lobbyist: null,
  procurement: '/api/metric'
}

const normalizeDatasetType = (value) => {
  if (!value) return null
  const text = String(value).toLowerCase()
  if (text === 'council-trends' || text === 'council-decisions') return 'council'
  if (text === 'capital-projects') return 'capital'
  return text
}

const getDatasetLabel = (dataset) => DATASET_LABELS[dataset] || String(dataset || 'Data')

const resolveValueType = (dataset) => {
  if (dataset === 'capital') return 'planned'
  if (dataset === 'money-flow') return 'actual'
  return null
}

const buildApiSourceForDataset = (dataset) => {
  const path = API_ENDPOINTS[dataset]
  if (!path) {
    return null
  }
  return {
    type: 'API',
    dataset,
    path
  }
}

const buildToolDataSource = (toolResult) => {
  if (!toolResult?.dataset) {
    return null
  }

  const dataset = toolResult.dataset
  const label = getDatasetLabel(dataset)
  const baseUrl = getGcsBaseUrl()

  if (toolResult.source === 'trends') {
    const trendPaths = {
      'money-flow': `${baseUrl}/gold/money-flow/trends.json`,
      capital: `${baseUrl}/gold/capital/trends.json`,
      council: `${baseUrl}/gold/council-decisions/trends.json`,
      lobbyist: `${baseUrl}/gold/lobbyist-registry/trends.json`
    }
    const path = trendPaths[dataset]
    if (!path) {
      return null
    }
    return {
      type: `${label} (gold trends)`,
      dataset,
      layer: 'gold',
      path
    }
  }

  if (toolResult.source === 'processed') {
    const processedConfigs = {
      capital: { folder: 'capital-by-ward', latestUrl: getCapitalDataUrl() },
      council: { folder: 'council-voting', latestUrl: getVotingDataUrl() },
      'money-flow': { folder: 'financial-return', latestUrl: getFinancialReturnUrl() },
      lobbyist: { folder: 'lobbyist-registry', latestUrl: getLobbyistDataUrl() }
    }
    const config = processedConfigs[dataset]
    if (!config) {
      return null
    }

    const years = Array.isArray(toolResult.years)
      ? toolResult.years.map(Number).filter(Number.isFinite)
      : toolResult.year
        ? [Number(toolResult.year)]
        : []

    if (years.length === 1) {
      const year = years[0]
      return {
        type: `${label} (processed)`,
        dataset,
        layer: 'processed',
        year,
        path: `${baseUrl}/processed/${config.folder}/${year}.json`
      }
    }

    if (years.length > 1) {
      return {
        type: `${label} (processed)`,
        dataset,
        layer: 'processed',
        years,
        paths: years.map((year) => `${baseUrl}/processed/${config.folder}/${year}.json`)
      }
    }

    return {
      type: `${label} (processed)`,
      dataset,
      layer: 'processed',
      path: config.latestUrl
    }
  }

  if (toolResult.source === 'ckan' && dataset === 'procurement') {
    return {
      type: `${label} (CKAN)`,
      dataset,
      layer: 'ckan',
      path: 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search'
    }
  }

  return null
}

const appendApiSources = (sources = [], dataTypes = []) => {
  const existing = new Set(
    sources
      .map((source) => source?.path)
      .filter(Boolean)
  )
  const datasets = Array.from(new Set(dataTypes.map(normalizeDatasetType).filter(Boolean)))
  const apiSources = []

  for (const dataset of datasets) {
    const apiSource = buildApiSourceForDataset(dataset)
    if (apiSource && !existing.has(apiSource.path)) {
      apiSources.push(apiSource)
    }
  }

  return sources.concat(apiSources)
}

const formatCount = (value) => {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return String(Math.round(value))
}

const formatPercent = (value) => {
  if (!Number.isFinite(value)) {
    return null
  }
  return `${Number(value).toFixed(1)}%`
}

const formatYearLabel = (years, usedLatest) => {
  if (usedLatest) {
    return 'in the latest available year'
  }
  if (!Array.isArray(years) || years.length === 0) {
    return 'in the latest available year'
  }
  const sorted = [...years].sort((a, b) => a - b)
  if (sorted.length === 1) {
    return `in ${sorted[0]}`
  }
  return `from ${sorted[0]} to ${sorted[sorted.length - 1]}`
}

const formatSingleYear = (year, usedLatest) => {
  if (usedLatest || !year) {
    return 'in the latest available year'
  }
  return `in ${year}`
}

const formatFilters = (filters = {}) => {
  const parts = []
  if (filters.ward) parts.push(`Ward ${filters.ward}`)
  if (filters.category) parts.push(String(filters.category))
  if (filters.councillor) parts.push(`Councillor ${filters.councillor}`)
  if (filters.subject) parts.push(String(filters.subject))
  if (parts.length === 0) {
    return ''
  }
  return `for ${parts.join(', ')}`
}

const formatMetricValue = (value, { dataset, metric, tool, flowType }) => {
  if (metric === 'pass_rate') {
    return formatPercent(Number(value))
  }
  if (tool === 'sum_amount' || metric === 'total') {
    if (dataset === 'capital' || dataset === 'money-flow') {
      return formatMoney(value)
    }
  }
  if (dataset === 'money-flow' && flowType) {
    return formatMoney(value)
  }
  if (dataset === 'capital' && metric === 'total') {
    return formatMoney(value)
  }
  if (tool === 'top_k' && metric === 'spending') {
    return formatMoney(value)
  }
  if (tool === 'procurement_metrics') {
    return formatMoney(value)
  }
  return formatCount(Number(value))
}

const buildSources = (toolResult) => {
  const sources = []
  if (Array.isArray(toolResult.sources) && toolResult.sources.length) {
    sources.push(...toolResult.sources)
  }
  const dataSource = buildToolDataSource(toolResult)
  if (dataSource) {
    sources.push(dataSource)
  }
  const apiSource = buildApiSourceForDataset(toolResult.dataset)
  if (apiSource) {
    sources.push(apiSource)
  }
  return sources
}

export const buildToolEnvelope = (toolResult) => {
  if (!toolResult || !toolResult.tool) {
    return null
  }

  const responseType = TOOL_RESPONSE_TYPES[toolResult.tool] || 'unknown'
  const completeness = ['trends', 'processed', 'ckan', 'glossary'].includes(toolResult.source)
    ? 'complete'
    : 'preview'

  if (toolResult.tool === 'count_records') {
    const unit = toolResult.recordType || 'records'
    const yearLabel = formatYearLabel(toolResult.years, toolResult.usedLatest)
    const filterLabel = formatFilters(toolResult.filters)
    const summary = `There were ${formatCount(toolResult.result)} ${unit}${filterLabel ? ` ${filterLabel}` : ''} ${yearLabel}.`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        value: toolResult.result,
        unit,
        years: toolResult.years || [],
        dataset: toolResult.dataset,
        recordType: toolResult.recordType,
        filters: toolResult.filters || {}
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'sum_amount') {
    const yearLabel = formatYearLabel(toolResult.years, toolResult.usedLatest)
    const valueLabel = formatMoney(toolResult.result)
    const filters = toolResult.filters || {}
    const flowTypeLabel = toolResult.flowType || 'expenditure'
    const valueType = resolveValueType(toolResult.dataset)

    let subject = toolResult.dataset === 'capital'
      ? 'capital plan allocation'
      : flowTypeLabel === 'revenue'
        ? 'revenue'
        : 'expenditure'
    let scope = ''

    if (toolResult.groupBy === 'ward' && toolResult.ward) {
      const wardName = toolResult.wardName ? ` (${toolResult.wardName})` : ''
      scope = `for Ward ${toolResult.ward}${wardName}`
    } else if (toolResult.groupBy === 'category' && toolResult.category) {
      scope = `for ${toolResult.category}`
    } else if (toolResult.groupBy === 'label' && toolResult.label) {
      scope = `from ${toolResult.label}`
    } else if (Object.keys(filters).length) {
      scope = formatFilters(filters)
    }

    const summary = `Total ${subject}${scope ? ` ${scope}` : ''} ${yearLabel} was ${valueLabel}.`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        value: toolResult.result,
        currency: 'CAD',
        valueType: valueType || undefined,
        years: toolResult.years || [],
        dataset: toolResult.dataset,
        groupBy: toolResult.groupBy || 'total',
        flowType: toolResult.flowType,
        ward: toolResult.ward,
        wardName: toolResult.wardName,
        category: toolResult.category,
        label: toolResult.label,
        filters: toolResult.filters || {}
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'budget_balance') {
    const yearLabel = formatSingleYear(toolResult.year, toolResult.usedLatest)
    const balance = toolResult.result?.balance
    const balanceType = toolResult.result?.balanceType || (Number(balance) >= 0 ? 'surplus' : 'deficit')
    const revenue = toolResult.result?.revenue
    const expenditure = toolResult.result?.expenditure
    const formattedBalance = formatMoney(Math.abs(Number(balance || 0)))

    const summary = toolResult.result
      ? `The budget ${yearLabel} showed a ${balanceType} of ${formattedBalance}.`
      : `Budget balance ${yearLabel} is not available.`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: 'money-flow',
        year: toolResult.year,
        valueType: resolveValueType('money-flow'),
        balance,
        balanceType,
        revenue,
        expenditure
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'compare_years') {
    const years = toolResult.years || []
    const sorted = [...years].sort((a, b) => a - b)
    const firstYear = sorted[0]
    const lastYear = sorted[sorted.length - 1]
    const firstValue = toolResult.results?.[firstYear]
    const lastValue = toolResult.results?.[lastYear]
    const metricLabel = toolResult.metric || 'value'
    const resolvedMetricLabel = toolResult.dataset === 'capital' && metricLabel === 'total'
      ? 'capital plan total'
      : toolResult.dataset === 'money-flow' && metricLabel === 'total'
        ? `${toolResult.flowType || 'expenditure'} total`
        : metricLabel
    const changeLabel = toolResult.change >= 0 ? 'increase' : 'decrease'
    const changeValue = Math.abs(Number(toolResult.change || 0))
    const changePercent = toolResult.changePercent ? `${Math.abs(Number(toolResult.changePercent))}%` : null
    const valueType = resolveValueType(toolResult.dataset)
    const summary = (firstValue === undefined || lastValue === undefined)
      ? `Comparison results are available for ${sorted.join(', ')}.`
      : `The ${resolvedMetricLabel} changed from ${formatMetricValue(firstValue, toolResult)} in ${firstYear} to ${formatMetricValue(lastValue, toolResult)} in ${lastYear} (${changeLabel} of ${formatMetricValue(changeValue, toolResult)}${changePercent ? `, ${changePercent}` : ''}).`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: toolResult.dataset,
        metric: toolResult.metric,
        valueType: valueType || undefined,
        years: toolResult.years || [],
        results: toolResult.results || {},
        change: toolResult.change,
        changePercent: toolResult.changePercent,
        filters: toolResult.filters || {},
        flowType: toolResult.flowType
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'council_metrics') {
    const yearLabel = formatSingleYear(toolResult.year, toolResult.usedLatest)
    const metric = toolResult.metric || 'total_motions'
    const rawValue = toolResult.result
    const formattedValue = metric === 'pass_rate'
      ? formatPercent(Number(rawValue))
      : formatCount(Number(rawValue))

    const summaries = {
      pass_rate: `Council pass rate ${yearLabel} was ${formattedValue}.`,
      meeting_count: `Council held ${formattedValue} meetings ${yearLabel}.`,
      total_motions: `Council considered ${formattedValue} motions ${yearLabel}.`,
      motions_passed: `Council passed ${formattedValue} motions ${yearLabel}.`,
      motions_failed: `Council failed ${formattedValue} motions ${yearLabel}.`
    }

    const summary = formattedValue
      ? summaries[metric] || `Council metrics ${yearLabel} are available.`
      : `Council metrics ${yearLabel} are not available.`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: 'council',
        year: toolResult.year,
        metric,
        value: rawValue
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'top_k') {
    const yearLabel = formatSingleYear(toolResult.year, toolResult.usedLatest)
    const results = Array.isArray(toolResult.results) ? toolResult.results : []
    const metricLabel = toolResult.metric || 'value'
    const resolvedMetricLabel = toolResult.dataset === 'capital' && metricLabel === 'spending'
      ? 'allocation'
      : metricLabel
    const groupLabel = toolResult.groupBy || 'items'
    const valueType = resolveValueType(toolResult.dataset)
    const topList = results.slice(0, 3).map((item) => {
      const value = formatMetricValue(item.value, toolResult)
      return `${item.label} (${value})`
    }).join(', ')

    const summary = results.length
      ? `Top ${Math.min(toolResult.k || results.length, results.length)} ${groupLabel} by ${resolvedMetricLabel} ${yearLabel}: ${topList}.`
      : `No ${groupLabel} results found ${yearLabel}.`

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: toolResult.dataset,
        groupBy: toolResult.groupBy,
        metric: toolResult.metric,
        valueType: valueType || undefined,
        year: toolResult.year,
        k: toolResult.k || results.length,
        results,
        filters: toolResult.filters || {}
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'procurement_metrics') {
    const yearLabel = formatSingleYear(toolResult.year, toolResult.usedLatest)
    const data = toolResult.result || {}
    const competitive = data.competitive || {}
    const nonCompetitive = data.nonCompetitive || {}
    const competitiveTotal = Number(competitive.totalValue || 0)
    const nonCompetitiveTotal = Number(nonCompetitive.totalValue || 0)
    const totalContracts = Number(competitive.contractCount || 0) + Number(nonCompetitive.contractCount || 0)
    const grandTotal = competitiveTotal + nonCompetitiveTotal

    let summary = `Procurement metrics ${yearLabel} are available.`
    if (toolResult.mode === 'competitive') {
      summary = `Competitive procurement ${yearLabel} totaled ${formatMoney(competitiveTotal)} across ${formatCount(competitive.contractCount || 0)} contracts.`
    } else if (toolResult.mode === 'noncompetitive') {
      const share = nonCompetitive.amountShare ? formatPercent(nonCompetitive.amountShare) : null
      summary = `Non-competitive procurement ${yearLabel} totaled ${formatMoney(nonCompetitiveTotal)} across ${formatCount(nonCompetitive.contractCount || 0)} contracts${share ? ` (${share} of spend)` : ''}.`
    } else {
      const share = nonCompetitive.amountShare ? formatPercent(nonCompetitive.amountShare) : null
      summary = `Procurement ${yearLabel} totaled ${formatMoney(grandTotal)} across ${formatCount(totalContracts)} contracts, with ${formatMoney(nonCompetitiveTotal)} non-competitive${share ? ` (${share} of spend)` : ''}.`
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: 'procurement',
        year: toolResult.year,
        mode: toolResult.mode || 'all',
        result: toolResult.result
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'get_motion_details') {
    const yearLabel = formatSingleYear(toolResult.year, toolResult.usedLatest)
    const motion = toolResult.result
    const title = motion?.agenda_item_title || motion?.motion_title || 'Motion'
    const description = motion?.vote_description
    const descriptionText = description ? ` Vote description: ${description}.` : ''

    let summaryParts = []
    if (motion) {
      summaryParts.push(`Motion ${motion.motion_id || ''} ${yearLabel}: "${title}". Outcome: ${motion.vote_outcome || 'unknown'}${Number.isFinite(motion.vote_margin) ? ` (margin ${motion.vote_margin})` : ''}.${descriptionText}`)

      // Add vote breakdown
      if (motion.voteBreakdown) {
        const { inFavour, against, absent } = motion.voteBreakdown
        if (inFavour?.length > 0) {
          summaryParts.push(`In favour (${inFavour.length}): ${inFavour.join(', ')}.`)
        }
        if (against?.length > 0) {
          summaryParts.push(`Against (${against.length}): ${against.join(', ')}.`)
        }
        if (absent?.length > 0) {
          summaryParts.push(`Absent (${absent.length}): ${absent.join(', ')}.`)
        }
      }

      // Add failure explanation
      if (motion.failureExplanation) {
        summaryParts.push(motion.failureExplanation)
      }
    } else {
      summaryParts.push(`I could not find that motion ${yearLabel} in the council voting data.`)
    }

    const summary = summaryParts.join(' ')

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: 'council',
        year: toolResult.year,
        motion: toolResult.result
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  if (toolResult.tool === 'glossary_lookup') {
    const entry = toolResult.result
    const summary = entry
      ? `${entry.term}: ${entry.definition}${entry.details ? ` ${entry.details}` : ''}`
      : 'I could not find that term in the glossary.'

    return {
      schemaVersion: SCHEMA_VERSION,
      responseType,
      summary,
      structured: {
        dataset: 'glossary',
        term: entry?.term || null,
        definition: entry?.definition || null,
        details: entry?.details || null
      },
      completeness,
      sources: buildSources(toolResult)
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    responseType,
    summary: 'Tool response ready.',
    structured: {
      result: toolResult.result
    },
    completeness,
    sources: buildSources(toolResult)
  }
}

export const buildNarrativeEnvelope = ({ summary, sources = [], ragStrategy, dataTypes = [], year }) => {
  const responseType = ragStrategy === 'filters' ? 'entity_detail' : 'narrative'
  const completeness = ragStrategy === 'embeddings' ? 'partial' : 'complete'

  return {
    schemaVersion: SCHEMA_VERSION,
    responseType,
    summary,
    structured: {
      text: summary,
      dataTypes,
      year
    },
    completeness,
    sources: appendApiSources(sources, dataTypes)
  }
}
