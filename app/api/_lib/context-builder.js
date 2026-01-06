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
import { retrieveDetailData, inferQueryType, getCouncilCouncillorNames } from './processed-retriever'
import { loadProcessedFile } from './data-loader'
import { executeTool } from './tool-executor'
import { routeToolWithLLM } from './tool-router'
import { extractEntitiesWithLLM } from './entity-llm-extractor'
import { canonicalizeCouncillorName } from './councillor-canonicalizer'

// Year extraction pattern
// Mechanical extraction patterns - for structured data only
const YEAR_PATTERN = /\b(20\d{2})\b/g
const MULTI_YEAR_PATTERN = /\b(?:last|past|previous)\s+(\d+)\s+years?\b/i
const COUNCIL_KEYWORDS = ['council', 'motion', 'motions', 'vote', 'votes', 'decision', 'decisions', 'meeting', 'meetings', 'councillor']
// Motion ID pattern: matches both "2024.CC25.1" (full) and "CC25.1" (short) formats
const MOTION_ID_PATTERN = /\b(?:20\d{2}\.)?[A-Z]{1,3}\d+\.\d+\b/i
const MOTION_TITLE_HINT_PATTERN = /\b(motion|agenda item|agenda|council motion)\b/i
const RECENT_KEYWORDS = ['recent', 'recently', 'latest', 'most recent']
const GLOSSARY_QUERY_PATTERN = /\b(what is|define|meaning of|what does .* mean|explain)\b/i
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
export async function buildContext(message, options = {}) {
  const history = Array.isArray(options.history) ? options.history : []
  const conversationId = options.conversationId || null
  let entities = parseEntities(message)

  // Entity enhancement:
  // - Keep ward/year regex extraction (fast, reliable)
  // - Canonicalize councillor names using processed council voting data
  // - If extraction is uncertain, use an LLM to extract structured entities
  const queryTypeHint = inferQueryType(message)
  const isCouncilLike = queryTypeHint === 'council' || isCouncilQuestion(message)

  if (isCouncilLike) {
    const { names: councillorCandidates } = await getCouncilCouncillorNames(entities.year)

    if (entities.councillor) {
      const canonical = canonicalizeCouncillorName(entities.councillor, councillorCandidates)
      if (canonical) {
        entities = { ...entities, councillor: canonical }
      }
    }

    const lower = String(message || '').toLowerCase()
    const looksLikeVotingByPerson =
      lower.includes('vote') ||
      lower.includes('voted') ||
      lower.includes('support') ||
      lower.includes('oppose') ||
      lower.includes('opposed') ||
      lower.includes('councillor')

    const missingKeyEntities = !entities.councillor && !entities.category && !entities.program && !entities.keyword && !entities.ward

    if (looksLikeVotingByPerson && missingKeyEntities) {
      try {
        const llmEntities = await extractEntitiesWithLLM({ message, history })
        if (llmEntities) {
          const merged = {
            ...entities,
            // Keep deterministic ward/year when present
            ward: entities.ward ?? llmEntities.ward,
            year: entities.year ?? llmEntities.year,
            category: entities.category ?? llmEntities.category,
            program: entities.program ?? llmEntities.program,
            councillor: entities.councillor ?? llmEntities.councillor,
            keyword: entities.keyword ?? llmEntities.keyword
          }

          if (merged.councillor) {
            const canonical = canonicalizeCouncillorName(merged.councillor, councillorCandidates)
            merged.councillor = canonical || merged.councillor
            // Keyword is usually harmful when a councillor is present.
            merged.keyword = null
          }

          entities = merged
        }
      } catch (error) {
        console.warn('LLM entity extraction failed, continuing:', error.message)
      }
    }

    if (entities.councillor) {
      entities = { ...entities, keyword: null }
    }
  } else {
    const missingKeyEntities = !entities.category && !entities.program && !entities.keyword && !entities.ward && !entities.councillor
    if (missingKeyEntities && String(message || '').trim().length >= 24) {
      try {
        const llmEntities = await extractEntitiesWithLLM({ message, history })
        if (llmEntities) {
          entities = {
            ...entities,
            ward: entities.ward ?? llmEntities.ward,
            year: entities.year ?? llmEntities.year,
            category: entities.category ?? llmEntities.category,
            program: entities.program ?? llmEntities.program,
            councillor: entities.councillor ?? llmEntities.councillor,
            keyword: entities.keyword ?? llmEntities.keyword
          }
        }
      } catch (error) {
        console.warn('LLM entity extraction failed, continuing:', error.message)
      }
    }
  }
  const executeToolCall = async (toolName, params, routing, confidence) => {
    const toolResult = await executeTool(toolName, {
      ...params,
      message,
      history,
      conversationId
    })
    return {
      retrievalType: 'tool',
      tool: toolName,
      toolRouting: routing,
      toolRoutingConfidence: confidence,
      toolResult
    }
  }

  const llmTool = await routeToolWithLLM(message, { history })
  if (llmTool) {
    try {
      return await executeToolCall(llmTool.tool, llmTool.params, 'llm', llmTool.confidence)
    } catch (error) {
      console.warn('LLM tool execution failed, falling back:', error.message)
    }
  }

  if (GLOSSARY_QUERY_PATTERN.test(message)) {
    try {
      const glossaryResult = await executeToolCall('glossary_lookup', { term: message }, 'heuristic', 1)
      if (glossaryResult?.toolResult?.result) {
        return glossaryResult
      }
    } catch (error) {
      console.warn('Glossary lookup failed, falling back:', error.message)
    }
  }

  const motionContext = await buildMotionDetailContext(message)
  if (motionContext) {
    // If user asks "why" and motion failed, enrich with web context
    const asksWhy = /\bwhy\b|\breason\b|\bhow come\b/i.test(message)
    if (asksWhy && motionContext.motionOutcome === 'failed') {
      try {
        const motionTitle = motionContext.motionTitle || 'motion'
        const webResult = await executeTool('web_lookup', {
          query: `toronto council "${motionTitle}" meeting minutes`,
          message,
          history,
          conversationId
        })
        if (webResult?.result?.context) {
          motionContext.data += `\n\n--- Additional Context from Official Sources ---\n${webResult.result.context.slice(0, 2000)}`
          motionContext.sources.push(...(webResult.sources || []))
        }
      } catch (error) {
        // Web lookup failed, continue with basic motion details
        console.warn('Web lookup for motion context failed:', error.message)
      }
    }
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
    const detail = detailResult.results || { items: [], totalCount: 0 }
    const results = Array.isArray(detail) ? detail : (detail.items || [])
    const detailYear = detailResult.actualYear ?? detailResult.year ?? null
    const detailMeta = {
      requestedYear: detailResult.requestedYear ?? null,
      actualYear: detailYear,
      fellBack: Boolean(detailResult.fellBack),
      latestYearChecked: detailResult.latestYearChecked ?? null
    }
    if (results.length > 0) {
      context = {
        data: formatDetailResults(detail, queryType, detailYear, detailEntities, detailMeta),
        sources: buildDetailSources(queryType, detailYear),
        dataTypes: [queryType],
        year: detailYear,
        retrievalType: 'rag',
        ragStrategy: 'filters',
        resultsCount: results.length,
        ...detailMeta
      }
    } else {
      const webLookup = await attemptWebLookup({
        message,
        history,
        conversationId,
        failureReason: 'no_filtered_records'
      })
      if (webLookup) {
        return webLookup
      }
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
    const queryWithHistory = buildContextualQuery(message, history)
    const searchResults = await semanticSearch(queryWithHistory, 5, 0.65)
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
      const webLookup = await attemptWebLookup({
        message,
        history,
        conversationId,
        failureReason: searchResults.failureReason
      })
      if (webLookup) {
        return webLookup
      }
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

const FOLLOW_UP_HINTS = [
  'tell me more',
  'more about',
  'what about',
  'can you expand',
  'why is that',
  'how does that',
  'can you explain'
]

const isFollowUpMessage = (message = '') => {
  const text = String(message).toLowerCase()
  if (!text) return false
  if (text.length <= 40) return true
  return FOLLOW_UP_HINTS.some((hint) => text.includes(hint))
}

const buildContextualQuery = (message, history = []) => {
  if (!history.length || !isFollowUpMessage(message)) {
    return message
  }
  const lastUser = [...history].reverse().find((entry) => entry.role === 'user')
  const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant')
  const contextParts = []
  if (lastUser?.content) {
    contextParts.push(`Previous question: ${lastUser.content}`)
  }
  if (lastAssistant?.content) {
    contextParts.push(`Previous answer: ${lastAssistant.content}`)
  }
  if (!contextParts.length) {
    return message
  }
  return `${message}\n\nContext:\n${contextParts.join('\n')}`
}

const shouldAttemptWebLookup = (message = '') => {
  const text = String(message || '').trim()
  if (!text) return false
  if (text.length < 6) return false
  // Don't try web lookup for simple greetings
  if (/^(hi|hello|thanks|thank you|bye)\b/i.test(text)) return false
  return true
}

const attemptWebLookup = async ({ message, history, conversationId }) => {
  if (!shouldAttemptWebLookup(message)) {
    return null
  }
  const query = buildContextualQuery(message, history)
  try {
    const webResult = await executeTool('web_lookup', {
      query,
      message,
      history,
      conversationId
    })
    if (!webResult?.result) {
      return {
        retrievalType: 'tool',
        tool: 'web_lookup',
        toolRouting: 'heuristic',
        toolRoutingConfidence: 0.7,
        toolResult: webResult
      }
    }
    return {
      retrievalType: 'tool',
      tool: 'web_lookup',
      toolRouting: 'heuristic',
      toolRoutingConfidence: 0.7,
      toolResult: webResult
    }
  } catch (error) {
    return null
  }
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

  // Add vote breakdown if available
  if (Array.isArray(match.votes) && match.votes.length > 0) {
    const yesVotes = match.votes.filter(v => v.final_vote?.toLowerCase() === 'yes')
    const noVotes = match.votes.filter(v => v.final_vote?.toLowerCase() === 'no')
    const absentVotes = match.votes.filter(v => v.final_vote?.toLowerCase() === 'absent')

    lines.push('')
    lines.push('VOTE BREAKDOWN:')
    if (yesVotes.length > 0) {
      lines.push(`In Favour (${yesVotes.length}): ${yesVotes.map(v => v.councillor_name).join(', ')}`)
    }
    if (noVotes.length > 0) {
      lines.push(`Against (${noVotes.length}): ${noVotes.map(v => v.councillor_name).join(', ')}`)
    }
    if (absentVotes.length > 0) {
      lines.push(`Absent (${absentVotes.length}): ${absentVotes.map(v => v.councillor_name).join(', ')}`)
    }

    // Add explanation for failed motions
    if (match.vote_outcome === 'failed') {
      const totalPresent = yesVotes.length + noVotes.length
      const majorityNeeded = Math.floor(totalPresent / 2) + 1
      lines.push('')
      lines.push(`This motion failed because it did not receive the required majority. It needed ${majorityNeeded} votes to pass but only received ${yesVotes.length}.`)
    }
  }

  const sourcePath = year
    ? `${getGcsBaseUrl()}/processed/council-voting/${year}.json`
    : getVotingDataUrl()

  return {
    data: lines.join('\n'),
    sources: [{
      type: 'Council Decisions (processed)',
      dataset: 'council',
      layer: 'processed',
      year: year || null,
      path: sourcePath
    }, {
      type: 'API',
      dataset: 'council',
      path: '/api/council-decisions'
    }],
    dataTypes: ['council'],
    year: year || null,
    retrievalType: 'rag',
    ragStrategy: 'filters',
    resultsCount: 1,
    // Expose for "why" web lookup in buildContext
    motionOutcome: match.vote_outcome || null,
    motionTitle: agendaTitle
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
  const detail = Array.isArray(results)
    ? { items: results, totalCount: results.length, councillorStats: null }
    : (results || { items: [], totalCount: 0, councillorStats: null })
  const items = Array.isArray(detail.items) ? detail.items : []

  if (!items.length) {
    return 'No matching records found for this query.'
  }

  const totalCount = Number.isFinite(detail.totalCount) ? detail.totalCount : items.length

  const fallbackNote = detailMeta.fellBack ? ' (most recent year with matches)' : ''
  const yearLabel = year ? `${year}${fallbackNote}` : 'latest available year'

  if (queryType === 'capital') {
    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0)
    const top = items.slice(0, 5)
    const wardLabel = entities.ward ? `Ward ${entities.ward}` : 'all wards'
    const categoryLabel = entities.category ? `${entities.category} projects` : 'capital projects'

    return `CAPITAL PROJECT DETAILS (${yearLabel}):
Found ${items.length} ${categoryLabel} in ${wardLabel} in ${yearLabel}, totaling ${formatMoney(total)}.
Top projects:
${top.map(item =>
  `- ${item.project_name || item.program_name || 'Unknown Project'}: ${formatMoney(item.amount || 0)}`
).join('\n')}`
  }

  if (queryType === 'council') {
    const passed = items.filter((item) => item.vote_outcome === 'passed').length
    const failed = items.filter((item) => item.vote_outcome === 'failed').length

    // Show different amounts based on query type:
    // - Councillor queries: show all (user wants voting detail, LLM can filter)
    // - General queries: show fewer (overview sufficient)
    const councillorName = entities.councillor
    const displayLimit = councillorName ? items.length : 10
    const top = items.slice(0, displayLimit)

    // If filtering by councillor, include their specific vote stats with CLEAR labeling
    let councillorSummary = ''
    if (councillorName && detail.councillorStats) {
      // Use pre-computed stats from all filtered records
      const { yes, no, absent } = detail.councillorStats
      councillorSummary = `
=== ${councillorName.toUpperCase()} VOTING SUMMARY ===
Total motions participated in: ${totalCount}
- Councillor voted YES: ${yes} motions
- Councillor voted NO: ${no} motions  
- Councillor was ABSENT: ${absent} motions
Of these ${totalCount} motions, ${passed} passed and ${failed} failed overall.
NOTE: "Councillor voted X" means how ${councillorName} voted. "Motion passed/failed" means the overall council outcome.`
    } else if (councillorName) {
      // Fallback: compute from displayed results only
      const councillorVotes = { yes: 0, no: 0, absent: 0 }
      const noVoteMotions = []
      for (const motion of items) {
        const votes = Array.isArray(motion.votes) ? motion.votes : []
        const councillorVote = votes.find(v =>
          v.councillor_name?.toLowerCase().includes(councillorName.toLowerCase())
        )
        if (councillorVote) {
          const voteType = (councillorVote.final_vote || '').toLowerCase()
          if (voteType === 'yes') councillorVotes.yes++
          else if (voteType === 'no') {
            councillorVotes.no++
            noVoteMotions.push({
              id: motion.motion_id,
              title: motion.motion_title,
              outcome: motion.vote_outcome
            })
          }
          else councillorVotes.absent++
        }
      }
      councillorSummary = `
=== ${councillorName.toUpperCase()} VOTING SUMMARY ===
Total motions participated in: ${totalCount}
- Councillor voted YES: ${councillorVotes.yes} motions
- Councillor voted NO: ${councillorVotes.no} motions
- Councillor was ABSENT: ${councillorVotes.absent} motions
Of these ${totalCount} motions, ${passed} passed and ${failed} failed overall.
NOTE: "Councillor voted X" means how ${councillorName} voted. "Motion passed/failed" means the overall council outcome.`
      
      // List ALL motions they voted NO on (this is journalism-critical data)
      if (noVoteMotions.length > 0) {
        councillorSummary += `

=== COMPLETE LIST OF MOTIONS ${councillorName.toUpperCase()} VOTED AGAINST (${noVoteMotions.length} total) ===
${noVoteMotions.map((m, i) => `${i + 1}. ${m.title} [${m.id}] - motion ${m.outcome}`).join('\n')}`
      }
    }

    // Format top motions with councillor's vote if filtering by councillor
    const formatMotion = (item) => {
      let voteInfo = ''
      if (councillorName && Array.isArray(item.votes)) {
        const councillorVote = item.votes.find(v =>
          v.councillor_name?.toLowerCase().includes(councillorName.toLowerCase())
        )
        if (councillorVote) {
          voteInfo = ` [${councillorName} voted: ${councillorVote.final_vote}]`
        }
      }
      return `- ${item.motion_title} (motion ${item.vote_outcome || 'unknown'})${voteInfo}`
    }

    return `COUNCIL VOTE DETAILS (${yearLabel}):
Found ${items.length} motions in ${yearLabel} (${passed} passed, ${failed} failed overall).${councillorSummary}

Recent motions:
${top.map(formatMotion).join('\n')}`
  }

  if (queryType === 'lobbyist') {
    const top = items.slice(0, 5)
    return `LOBBYIST ACTIVITY (${yearLabel}):
Found ${items.length} activity records in ${yearLabel}.
Examples:
${top.map(item =>
  `- ${item.subject_matter || item.subject_category || 'Unknown topic'} (client: ${item.client_name || 'unknown'})`
).join('\n')}`
  }

  return `Found ${results.length} matching records.`
}
