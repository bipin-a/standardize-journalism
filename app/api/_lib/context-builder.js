// Context Builder - Tool + RAG routing
// Uses deterministic tools first, then RAG (filters/embeddings), and fails closed.

import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  getCouncilIndexUrl,
  getCouncilTrendsUrl,
  getGcsBaseUrl,
  getVotingDataUrl
} from './gcs-urls'
import { semanticSearch } from './rag-retriever'
import { parseEntities, hasDetailEntities } from './entity-parser'
import { retrieveDetailData, inferQueryType } from './processed-retriever'
import { loadProcessedFile } from './data-loader'
import { executeTool } from './tool-executor'
import { routeToolWithLLM } from './tool-router'

// Year extraction pattern
const YEAR_PATTERN = /\b(20\d{2})\b/g
const MULTI_YEAR_PATTERN = /\b(?:last|past|previous)\s+(\d+)\s+years?\b/i
const COUNCIL_KEYWORDS = ['council', 'motion', 'motions', 'vote', 'votes', 'decision', 'decisions', 'meeting', 'meetings', 'councillor']
const MOTION_ID_PATTERN = /\b[A-Z]{1,3}\d+\.\d+\b/i
const MOTION_TITLE_HINT_PATTERN = /\b(motion|agenda item|agenda|council motion)\b/i
const RECENT_KEYWORDS = ['recent', 'recently', 'latest', 'most recent']
const MOTION_TITLE_PATTERNS = [
  /\b(?:motion|agenda item)\s+(?:titled|called|about|on|regarding)\s+(.+)/i,
  /\b(?:motion|agenda item)\s*:\s*(.+)/i,
  /\b(?:motion|agenda item)\s+(.+)/i
]
async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label || 'data'} from ${url}: ${response.status}`)
  }
  return response.json()
}

async function readLocalJson(relativePath) {
  const fileContent = await readFile(join(process.cwd(), relativePath), 'utf-8')
  return JSON.parse(fileContent)
}

async function loadJsonWithFallback(url, localPath, label) {
  if (url) {
    try {
      return await fetchJson(url, label)
    } catch (error) {
      console.warn(`Remote ${label || 'data'} unavailable, falling back to local:`, error.message)
    }
  }

  if (localPath) {
    try {
      return await readLocalJson(localPath)
    } catch (error) {
      console.warn(`Local ${label || 'data'} unavailable:`, error.message)
    }
  }

  return null
}

/**
 * Build context using hybrid retrieval:
 * - Detail queries (entities) -> processed per-year filters
 * - Overview queries -> embeddings over gold summaries
 * - If nothing matches, return a no-answer context (fail closed)
 */
export async function buildContext(message) {
  const entities = parseEntities(message)
  const executeToolCall = async (toolName, params, routing, confidence) => {
    const toolResult = await executeTool(toolName, { ...params, message })
    return {
      retrievalType: 'tool',
      tool: toolName,
      toolRouting: routing,
      toolRoutingConfidence: confidence,
      toolResult
    }
  }

  const llmTool = await routeToolWithLLM(message)
  if (llmTool) {
    try {
      return await executeToolCall(llmTool.tool, llmTool.params, 'llm', llmTool.confidence)
    } catch (error) {
      console.warn('LLM tool execution failed, falling back:', error.message)
    }
  }

  const motionContext = await buildMotionDetailContext(message)
  if (motionContext) {
    return motionContext
  }

  const multiYearCouncil = await buildCouncilMultiYearSummary(message)

  let context = null

  const wantsRecentCouncil = isCouncilQuestion(message) && RECENT_KEYWORDS.some((keyword) => message.toLowerCase().includes(keyword))
  if (hasDetailEntities(entities) || wantsRecentCouncil) {
    const queryType = inferQueryType(message)
    const detailEntities = wantsRecentCouncil
      ? { ...entities, keyword: null }
      : entities
    const detailResult = await retrieveDetailData(detailEntities, queryType)
    const results = detailResult.results || []
    const detailYear = detailResult.actualYear ?? detailResult.year ?? null
    const detailMeta = {
      requestedYear: detailResult.requestedYear ?? null,
      actualYear: detailYear,
      fellBack: Boolean(detailResult.fellBack),
      latestYearChecked: detailResult.latestYearChecked ?? null
    }
    if (results.length > 0) {
      context = {
        data: formatDetailResults(results, queryType, detailYear, detailEntities, detailMeta),
        sources: buildDetailSources(queryType, detailYear),
        dataTypes: [queryType],
        year: detailYear,
        retrievalType: 'rag',
        ragStrategy: 'filters',
        resultsCount: results.length,
        ...detailMeta
      }
    } else {
      context = {
        data: '',
        sources: buildDetailSources(queryType, detailYear),
        dataTypes: [queryType],
        year: detailYear,
        retrievalType: 'rag',
        ragStrategy: 'filters',
        resultsCount: 0,
        noAnswer: true,
        failureReason: 'no_filtered_records',
        failureDetail: JSON.stringify({
          dataset: queryType,
          requestedYear: detailMeta.requestedYear,
          actualYear: detailMeta.actualYear,
          latestYearChecked: detailMeta.latestYearChecked,
          fellBack: detailMeta.fellBack,
          filters: detailEntities
        }),
        ...detailMeta
      }
    }
  }

  if (!context) {
    const searchResults = await semanticSearch(message, 5, 0.65)
    if (searchResults.chunks.length > 0) {
      context = {
        data: searchResults.chunks.map((chunk) => chunk.text).join('\n\n---\n\n'),
        sources: searchResults.sources,
        dataTypes: searchResults.dataTypes,
        year: searchResults.sources.find((source) => source.year)?.year || null,
        retrievalType: 'rag',
        ragStrategy: 'embeddings',
        scores: searchResults.scores,
        resultsCount: searchResults.chunks.length
      }
    } else {
      const failureReason = searchResults.failureReason || 'no_embeddings_hits'
      context = {
        data: '',
        sources: [],
        dataTypes: [],
        year: null,
        retrievalType: 'rag',
        ragStrategy: 'embeddings',
        resultsCount: 0,
        noAnswer: true,
        failureReason,
        failureDetail: searchResults.failureDetail || null
      }
    }
  }

  if (multiYearCouncil && context?.data) {
    context = {
      ...context,
      data: `${multiYearCouncil.text}\n\n${context.data}`,
      sources: [...multiYearCouncil.sources, ...(context.sources || [])],
      dataTypes: [...new Set([...(context.dataTypes || []), 'council-trends'])],
      retrievalType: context.retrievalType || 'rag',
      ragStrategy: context.ragStrategy || 'embeddings'
    }
  }

  return context
}

async function loadCouncilTrends() {
  try {
    const trendsUrl = getCouncilTrendsUrl()
    return await loadJsonWithFallback(
      trendsUrl,
      'data/gold/council-decisions/trends.json',
      'council trends'
    )
  } catch (error) {
    console.warn('Failed to load council trends:', error.message)
    return null
  }
}

const isCouncilQuestion = (message) => {
  const lower = message.toLowerCase()
  return COUNCIL_KEYWORDS.some((keyword) => lower.includes(keyword))
}

const extractYearWindow = (message) => {
  const match = message.match(MULTI_YEAR_PATTERN)
  if (!match) {
    return null
  }
  const parsed = parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function buildCouncilMultiYearSummary(message) {
  if (!isCouncilQuestion(message)) {
    return null
  }

  const windowYears = extractYearWindow(message)
  if (!windowYears || windowYears < 2) {
    return null
  }

  const trends = await loadCouncilTrends()
  let selectedYears = []
  let byYear = {}
  let sourcePath = getCouncilTrendsUrl()

  if (trends && Array.isArray(trends.availableYears) && trends.availableYears.length) {
    const available = [...trends.availableYears].sort((a, b) => a - b)
    selectedYears = available.slice(-windowYears)
    byYear = trends.byYear || {}
  } else {
    const index = await loadJsonWithFallback(
      getCouncilIndexUrl(),
      'data/gold/council-decisions/index.json',
      'council index'
    )
    if (!index || !Array.isArray(index.availableYears) || !index.availableYears.length) {
      return null
    }
    const available = [...index.availableYears].sort((a, b) => a - b)
    selectedYears = available.slice(-windowYears)
    const baseUrl = getGcsBaseUrl()
    sourcePath = getCouncilIndexUrl()

    for (const year of selectedYears) {
      const yearUrl = index.files?.[String(year)] || `${baseUrl}/gold/council-decisions/${year}.json`
      const summary = await loadJsonWithFallback(
        yearUrl,
        `data/gold/council-decisions/${year}.json`,
        `council ${year}`
      )
      if (summary?.metadata) {
        byYear[String(year)] = summary.metadata
      }
    }
  }

  if (!selectedYears.length) {
    return null
  }
  let totalMotions = 0
  let motionsPassed = 0
  let motionsFailed = 0
  let meetingCount = 0

  for (const year of selectedYears) {
    const stats = byYear[String(year)] || {}
    totalMotions += Number(stats.total_motions || 0)
    motionsPassed += Number(stats.motions_passed || 0)
    motionsFailed += Number(stats.motions_failed || 0)
    meetingCount += Number(stats.meeting_count || 0)
  }

  const passRate = totalMotions > 0 ? (motionsPassed / totalMotions) * 100 : 0

  return {
    text: `COUNCIL DECISIONS (Last ${windowYears} years, ${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}):
Total Motions: ${totalMotions}
Meetings: ${meetingCount}
Passed: ${motionsPassed}
Failed: ${motionsFailed}
Pass Rate: ${passRate.toFixed(1)}%`,
    sources: [{
      type: 'council-trends',
      years: selectedYears,
      path: sourcePath
    }]
  }
}

function extractMotionId(message) {
  const match = message.match(MOTION_ID_PATTERN)
  return match ? match[0] : null
}

function extractMotionYear(motionId) {
  const match = motionId.match(/\b(20\d{2})\b/)
  if (!match) {
    return null
  }
  const year = parseInt(match[1], 10)
  return Number.isFinite(year) ? year : null
}

function extractYearFromMessage(message) {
  const match = message.match(YEAR_PATTERN)
  if (!match) {
    return null
  }
  const year = parseInt(match[0], 10)
  return Number.isFinite(year) ? year : null
}

function cleanTitleQuery(raw) {
  if (!raw) {
    return null
  }
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/\s*[?.!]+$/, '').trim()
  cleaned = cleaned.replace(/\b(in|from|during|on|at|for)\s+20\d{2}\b.*$/i, '').trim()
  cleaned = cleaned.replace(/\s+and\s+(how|what|when|where|who|which|why).*/i, '').trim()
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim()
  if (cleaned.length < 6) {
    return null
  }
  if (cleaned.length > 160) {
    cleaned = cleaned.slice(0, 160).trim()
  }
  return cleaned
}

function extractMotionTitleQuery(message) {
  const quoted = message.match(/"([^"]+)"|'([^']+)'/)
  if (quoted) {
    return cleanTitleQuery(quoted[1] || quoted[2])
  }

  for (const pattern of MOTION_TITLE_PATTERNS) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const cleaned = cleanTitleQuery(match[1])
      if (cleaned) {
        return cleaned
      }
    }
  }

  return null
}

async function buildMotionDetailContext(message) {
  const motionId = extractMotionId(message)
  const hasMotionHint = MOTION_TITLE_HINT_PATTERN.test(message)
  const titleQuery = !motionId && hasMotionHint ? extractMotionTitleQuery(message) : null

  if (!motionId && !titleQuery) {
    return null
  }

  const year = motionId ? extractMotionYear(motionId) : extractYearFromMessage(message)
  const data = await loadProcessedFile('council', year)
  if (!Array.isArray(data)) {
    return null
  }

  const queryLower = titleQuery ? titleQuery.toLowerCase() : null
  const match = data.find((motion) => {
    if (motionId) {
      return String(motion.motion_id || '').toLowerCase() === String(motionId).toLowerCase()
    }
    if (queryLower) {
      const haystack = [
        motion.agenda_item_title,
        motion.motion_title,
        motion.vote_description
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(queryLower)
    }
    return false
  })

  if (!match) {
    return null
  }

  const agendaTitle = match.agenda_item_title || match.motion_title || 'Unknown motion'
  const voteDescription = match.vote_description || null
  const lines = [
    `MOTION DETAILS (${match.motion_id}):`,
    `Agenda Item Title: ${agendaTitle}`
  ]
  if (voteDescription) {
    lines.push(`Vote Description: ${voteDescription}`)
  }
  if (match.meeting_date) {
    lines.push(`Meeting Date: ${match.meeting_date}`)
  }
  if (match.vote_outcome) {
    lines.push(`Outcome: ${match.vote_outcome}`)
  }
  if (Number.isFinite(match.vote_margin)) {
    lines.push(`Vote Margin: ${match.vote_margin}`)
  }

  const sourcePath = year
    ? `${getGcsBaseUrl()}/processed/council-voting/${year}.json`
    : getVotingDataUrl()

  return {
    data: lines.join('\n'),
    sources: [{
      type: 'council-voting',
      year: year || null,
      path: sourcePath
    }],
    dataTypes: ['council'],
    year: year || null,
    retrievalType: 'rag',
    ragStrategy: 'filters',
    resultsCount: 1
  }
}

function formatMoney(amount) {
  const value = Number(amount) || 0
  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`
  }
  if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`
  }
  return `$${value.toFixed(0)}`
}

function buildDetailSources(queryType, year) {
  const baseUrl = getGcsBaseUrl()
  if (!year) {
    return [{ type: queryType, path: null }]
  }

  if (queryType === 'capital') {
    return [{
      type: 'capital',
      year,
      path: `${baseUrl}/processed/capital-by-ward/${year}.json`
    }]
  }

  if (queryType === 'council') {
    return [{
      type: 'council',
      year,
      path: `${baseUrl}/processed/council-voting/${year}.json`
    }]
  }

  if (queryType === 'lobbyist') {
    return [{
      type: 'lobbyist',
      year,
      path: `${baseUrl}/processed/lobbyist-registry/${year}.json`
    }]
  }

  return [{ type: queryType, year, path: null }]
}

function formatDetailResults(results, queryType, year, entities, detailMeta = {}) {
  if (!results.length) {
    return 'No matching records found for this query.'
  }

  const fallbackNote = detailMeta.fellBack ? ' (most recent year with matches)' : ''
  const yearLabel = year ? `${year}${fallbackNote}` : 'latest available year'

  if (queryType === 'capital') {
    const total = results.reduce((sum, item) => sum + (item.amount || 0), 0)
    const top = results.slice(0, 5)
    const wardLabel = entities.ward ? `Ward ${entities.ward}` : 'all wards'
    const categoryLabel = entities.category ? `${entities.category} projects` : 'capital projects'

    return `CAPITAL PROJECT DETAILS (${yearLabel}):
Found ${results.length} ${categoryLabel} in ${wardLabel} in ${yearLabel}, totaling ${formatMoney(total)}.
Top projects:
${top.map(item =>
  `- ${item.project_name || item.program_name || 'Unknown Project'}: ${formatMoney(item.amount || 0)}`
).join('\n')}`
  }

  if (queryType === 'council') {
    const passed = results.filter((item) => item.vote_outcome === 'passed').length
    const failed = results.filter((item) => item.vote_outcome === 'failed').length
    const top = results.slice(0, 5)

    return `COUNCIL VOTE DETAILS (${yearLabel}):
Found ${results.length} motions in ${yearLabel} (${passed} passed, ${failed} failed).
Recent motions:
${top.map(item =>
  `- ${item.motion_title} (${item.vote_outcome || 'unknown'})`
).join('\n')}`
  }

  if (queryType === 'lobbyist') {
    const top = results.slice(0, 5)
    return `LOBBYIST ACTIVITY (${yearLabel}):
Found ${results.length} activity records in ${yearLabel}.
Examples:
${top.map(item =>
  `- ${item.subject_matter || item.subject_category || 'Unknown topic'} (client: ${item.client_name || 'unknown'})`
).join('\n')}`
  }

  return `Found ${results.length} matching records.`
}
