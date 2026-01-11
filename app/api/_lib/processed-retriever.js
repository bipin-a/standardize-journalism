import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  getCapitalIndexUrl,
  getCouncilIndexUrl,
  getGcsBaseUrl,
  getLobbyistTrendsUrl
} from './gcs-urls'
import { normalizeCategoryFilter } from './data-loader'

const CACHE_TTL_MS = 5 * 60 * 1000
const processedCache = new Map()
const indexCache = new Map()
const derivedCache = new Map()

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.json()
}

const readLocalJson = async (relativePath) => {
  const fileContent = await readFile(join(process.cwd(), relativePath), 'utf-8')
  return JSON.parse(fileContent)
}

const validateProcessedData = (data, sourceLabel) => {
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid processed data from ${sourceLabel}: expected JSON object/array`)
  }
  return data
}

const loadProcessedFile = async (relativePath) => {
  const cacheKey = `processed:${relativePath}`
  const cached = processedCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const url = `${getGcsBaseUrl()}/processed/${relativePath}`
  try {
    const data = validateProcessedData(await fetchJson(url), url)
    // Annotate data with source metadata for downstream verification
    if (data && typeof data === 'object') {
      data._source = { source: 'remote', fetchedAt: Date.now(), fallback: false }
    }
    processedCache.set(cacheKey, { data, timestamp: Date.now() })
    return data
  } catch (error) {
    console.warn(`Processed fetch failed, falling back to local: ${error.message}`)
  }

  const data = validateProcessedData(
    await readLocalJson(`data/processed/${relativePath}`),
    `local:${relativePath}`
  )
  if (data && typeof data === 'object') {
    data._source = { source: 'local_fallback', fetchedAt: Date.now(), fallback: true }
  }
  processedCache.set(cacheKey, { data, timestamp: Date.now() })
  return data
}

export const getCouncilCouncillorNames = async (yearOverride = null) => {
  const year = yearOverride ?? await getLatestCouncilYear()
  if (!year) {
    return { year: null, names: [] }
  }

  const cacheKey = `council-councillors:${year}`
  const cached = derivedCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  let data
  try {
    data = await loadProcessedFile(`council-voting/${year}.json`)
  } catch (error) {
    console.warn(`Council data not available for year ${year}: ${error.message}`)
    const empty = { year, names: [] }
    derivedCache.set(cacheKey, { data: empty, timestamp: Date.now() })
    return empty
  }

  const names = new Set()
  for (const record of Array.isArray(data) ? data : []) {
    const votes = Array.isArray(record?.votes) ? record.votes : []
    for (const vote of votes) {
      const name = String(vote?.councillor_name || '').trim()
      if (name) {
        names.add(name)
      }
    }
  }

  const result = { year, names: Array.from(names).sort((a, b) => a.localeCompare(b)) }
  derivedCache.set(cacheKey, { data: result, timestamp: Date.now() })
  return result
}

const loadIndex = async (label, url, localPath) => {
  const cached = indexCache.get(label)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const data = await fetchJson(url)
    indexCache.set(label, { data, timestamp: Date.now() })
    return data
  } catch (error) {
    console.warn(`Index fetch failed, falling back to local: ${error.message}`)
  }

  const data = await readLocalJson(localPath)
  indexCache.set(label, { data, timestamp: Date.now() })
  return data
}

const normalizeAvailableYears = (years) => {
  const normalized = Array.isArray(years)
    ? years.map(Number).filter(Number.isFinite)
    : []
  if (!normalized.length) {
    return []
  }
  const currentYear = new Date().getFullYear()
  const cappedYears = normalized.filter((year) => year <= currentYear)
  const effectiveYears = cappedYears.length ? cappedYears : normalized
  return Array.from(new Set(effectiveYears)).sort((a, b) => a - b)
}

const pickLatestYear = (index) => {
  const availableYears = normalizeAvailableYears(index?.availableYears || index?.years || [])
  return availableYears[availableYears.length - 1] || null
}

const getAvailableCapitalYears = async () => {
  const index = await loadIndex('capital', getCapitalIndexUrl(), 'data/gold/capital/index.json')
  return normalizeAvailableYears(index?.availableYears || index?.years || [])
}

const getAvailableCouncilYears = async () => {
  const index = await loadIndex('council', getCouncilIndexUrl(), 'data/gold/council-decisions/index.json')
  return normalizeAvailableYears(index?.availableYears || index?.years || [])
}

const getAvailableLobbyistYears = async () => {
  const trends = await loadIndex('lobbyist-trends', getLobbyistTrendsUrl(), 'data/gold/lobbyist-registry/trends.json')
  return normalizeAvailableYears(trends?.availableYears || trends?.years || [])
}

const getLatestCapitalYear = async () => {
  const index = await loadIndex('capital', getCapitalIndexUrl(), 'data/gold/capital/index.json')
  return pickLatestYear(index)
}

const getLatestCouncilYear = async () => {
  const index = await loadIndex('council', getCouncilIndexUrl(), 'data/gold/council-decisions/index.json')
  return pickLatestYear(index)
}

const matchesText = (text, keyword) => {
  if (!keyword) return true
  if (!text) return false
  return text.toLowerCase().includes(keyword.toLowerCase())
}

const matchesAnyText = (fields, keyword) =>
  fields.some((field) => matchesText(field || '', keyword))

export const searchCapitalProjects = async (entities, yearOverride = null) => {
  const year = yearOverride ?? entities.year ?? await getLatestCapitalYear()
  if (!year) {
    return { items: [], totalCount: 0, year }
  }

  let data
  try {
    data = await loadProcessedFile(`capital-by-ward/${year}.json`)
  } catch (error) {
    console.warn(`Capital data not available for year ${year}: ${error.message}`)
    return { items: [], totalCount: 0, year }
  }

  const normalizedCategory = normalizeCategoryFilter(entities.category)
  const normalizedProgram = normalizeCategoryFilter(entities.program)

  const filtered = data
    .filter((record) => {
      if (entities.ward && record.ward_number !== entities.ward) return false
      if (normalizedCategory && !matchesAnyText([record.category, record.program_name, record.project_name], normalizedCategory)) return false
      if (normalizedProgram && !matchesAnyText([record.program_name, record.project_name], normalizedProgram)) return false
      if (entities.keyword && !matchesAnyText([record.project_name, record.program_name, record.category], entities.keyword)) return false
      return true
    })
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))

  return {
    items: filtered.slice(0, 50),
    totalCount: filtered.length,
    year
  }
}

export const searchCouncilVotes = async (entities, yearOverride = null) => {
  const year = yearOverride ?? entities.year ?? await getLatestCouncilYear()
  if (!year) {
    return { items: [], totalCount: 0, councillorStats: null, year }
  }

  let data
  try {
    data = await loadProcessedFile(`council-voting/${year}.json`)
  } catch (error) {
    console.warn(`Council data not available for year ${year}: ${error.message}`)
    return { items: [], totalCount: 0, councillorStats: null, year }
  }

  const filtered = data
    .filter((record) => {
      if (entities.category && !matchesAnyText([record.motion_category, record.motion_title], entities.category)) return false
      if (entities.keyword && !matchesText(record.motion_title, entities.keyword)) return false
      if (entities.councillor) {
        const votes = Array.isArray(record.votes) ? record.votes : []
        const match = votes.some((vote) => matchesText(vote.councillor_name, entities.councillor))
        if (!match) return false
      }
      return true
    })
    .sort((a, b) => String(b.meeting_date || '').localeCompare(String(a.meeting_date || '')))

  // Deduplicate by motion_id (keep first occurrence - most recent date)
  const seenMotions = new Set()
  const deduped = filtered.filter((record) => {
    if (seenMotions.has(record.motion_id)) return false
    seenMotions.add(record.motion_id)
    return true
  })

  let councillorStats = null

  // Compute councillor vote breakdown on ALL filtered records
  if (entities.councillor) {
    councillorStats = { yes: 0, no: 0, absent: 0 }
    for (const motion of deduped) {
      const votes = Array.isArray(motion.votes) ? motion.votes : []
      // Find the councillor's vote (data is now clean - one vote per councillor per motion from ETL)
      const councillorVote = votes.find((vote) => matchesText(vote.councillor_name, entities.councillor))

      if (councillorVote) {
        const voteType = String(councillorVote.final_vote || '').toLowerCase()
        if (voteType === 'yes') councillorStats.yes++
        else if (voteType === 'no') councillorStats.no++
        else councillorStats.absent++
      }
    }
  }

  // Return all filtered/deduped results - natural bounds from year + councillor filtering
  // No arbitrary caps needed; realistic max is ~600-750 motions/year/councillor
  return {
    items: deduped,
    totalCount: deduped.length,
    councillorStats,
    year
  }
}

export const searchLobbyistActivity = async (entities) => {
  if (!entities.year) {
    return { items: [], totalCount: 0, year: null }
  }

  let data
  try {
    data = await loadProcessedFile(`lobbyist-registry/${entities.year}.json`)
  } catch (error) {
    console.warn(`Lobbyist data not available for year ${entities.year}: ${error.message}`)
    return { items: [], totalCount: 0, year: entities.year }
  }

  const filtered = data
    .filter((record) => {
      if (entities.keyword && !matchesAnyText([
        record.subject_matter,
        record.subject_category,
        record.lobbyist_name,
        record.client_name,
        record.public_office_holder
      ], entities.keyword)) return false
      return true
    })

  return {
    items: filtered.slice(0, 30),
    totalCount: filtered.length,
    year: entities.year
  }
}

// Infer query type from EXTRACTED entities, not from keyword matching
export const inferQueryType = (entities) => {
  // If we have council-specific entities, it's a council query
  if (entities.councillor) return 'council'
  if (entities.lobbyist) return 'lobbyist'

  // Fallback to capital (most common query type)
  return 'capital'
}

const getAvailableYearsForQueryType = async (queryType) => {
  if (queryType === 'capital') {
    return getAvailableCapitalYears()
  }
  if (queryType === 'council') {
    return getAvailableCouncilYears()
  }
  if (queryType === 'lobbyist') {
    return getAvailableLobbyistYears()
  }
  return []
}

const runDetailSearch = async (entities, queryType, year) => {
  if (!year && queryType === 'lobbyist') {
    return { items: [], totalCount: 0, year: null }
  }
  const scoped = { ...entities, year }
  switch (queryType) {
    case 'council':
      return searchCouncilVotes(scoped, year)
    case 'lobbyist':
      return searchLobbyistActivity(scoped)
    case 'capital':
    default:
      return searchCapitalProjects(scoped, year)
  }
}

export const retrieveDetailData = async (entities, queryType) => {
  const requestedYear = entities.year || null
  const availableYears = await getAvailableYearsForQueryType(queryType)
  const latestYear = availableYears[availableYears.length - 1] || null

  if (requestedYear) {
    const results = await runDetailSearch(entities, queryType, requestedYear)
    return {
      results,
      year: requestedYear,
      requestedYear,
      actualYear: requestedYear,
      fellBack: false,
      latestYearChecked: latestYear
    }
  }

  if (!latestYear) {
    return {
      results: { items: [], totalCount: 0, year: null },
      year: null,
      requestedYear: null,
      actualYear: null,
      fellBack: false,
      latestYearChecked: null
    }
  }

  const latestResults = await runDetailSearch(entities, queryType, latestYear)
  if ((latestResults?.items || []).length) {
    return {
      results: latestResults,
      year: latestYear,
      requestedYear: null,
      actualYear: latestYear,
      fellBack: false,
      latestYearChecked: latestYear
    }
  }

  const fallbackYears = availableYears
    .filter((year) => year !== latestYear)
    .sort((a, b) => b - a)

  for (const year of fallbackYears) {
    // eslint-disable-next-line no-await-in-loop
    const results = await runDetailSearch(entities, queryType, year)
    if ((results?.items || []).length) {
      return {
        results,
        year,
        requestedYear: null,
        actualYear: year,
        fellBack: true,
        latestYearChecked: latestYear
      }
    }
  }

  return {
    results: { items: [], totalCount: 0, year: latestYear },
    year: latestYear,
    requestedYear: null,
    actualYear: latestYear,
    fellBack: false,
    latestYearChecked: latestYear
  }
}
