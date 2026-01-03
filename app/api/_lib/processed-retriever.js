import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  getCapitalIndexUrl,
  getCouncilIndexUrl,
  getGcsBaseUrl
} from './gcs-urls'
import { normalizeCategoryFilter } from './data-loader'

const CACHE_TTL_MS = 5 * 60 * 1000
const processedCache = new Map()
const indexCache = new Map()

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

const loadProcessedFile = async (relativePath) => {
  const cacheKey = `processed:${relativePath}`
  const cached = processedCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const url = `${getGcsBaseUrl()}/processed/${relativePath}`
  try {
    const data = await fetchJson(url)
    processedCache.set(cacheKey, { data, timestamp: Date.now() })
    return data
  } catch (error) {
    console.warn(`Processed fetch failed, falling back to local: ${error.message}`)
  }

  const data = await readLocalJson(`data/processed/${relativePath}`)
  processedCache.set(cacheKey, { data, timestamp: Date.now() })
  return data
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
    return []
  }

  let data
  try {
    data = await loadProcessedFile(`capital-by-ward/${year}.json`)
  } catch (error) {
    console.warn(`Capital data not available for year ${year}: ${error.message}`)
    return []
  }

  const normalizedCategory = normalizeCategoryFilter(entities.category)
  const normalizedProgram = normalizeCategoryFilter(entities.program)

  return data
    .filter((record) => {
      if (entities.ward && record.ward_number !== entities.ward) return false
      if (normalizedCategory && !matchesAnyText([record.category, record.program_name, record.project_name], normalizedCategory)) return false
      if (normalizedProgram && !matchesAnyText([record.program_name, record.project_name], normalizedProgram)) return false
      if (entities.keyword && !matchesAnyText([record.project_name, record.program_name, record.category], entities.keyword)) return false
      return true
    })
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 50)
}

export const searchCouncilVotes = async (entities, yearOverride = null) => {
  const year = yearOverride ?? entities.year ?? await getLatestCouncilYear()
  if (!year) {
    return []
  }

  let data
  try {
    data = await loadProcessedFile(`council-voting/${year}.json`)
  } catch (error) {
    console.warn(`Council data not available for year ${year}: ${error.message}`)
    return []
  }

  return data
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
    .slice(0, 30)
}

export const searchLobbyistActivity = async (entities) => {
  if (!entities.year) {
    return []
  }

  let data
  try {
    data = await loadProcessedFile(`lobbyist-registry/${entities.year}.json`)
  } catch (error) {
    console.warn(`Lobbyist data not available for year ${entities.year}: ${error.message}`)
    return []
  }

  return data
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
    .slice(0, 30)
}

export const inferQueryType = (message) => {
  const lower = message.toLowerCase()
  if (lower.includes('vote') || lower.includes('council') || lower.includes('motion')) {
    return 'council'
  }
  if (lower.includes('lobby')) {
    return 'lobbyist'
  }
  return 'capital'
}

const getAvailableYearsForQueryType = async (queryType) => {
  if (queryType === 'capital') {
    return getAvailableCapitalYears()
  }
  if (queryType === 'council') {
    return getAvailableCouncilYears()
  }
  return []
}

const runDetailSearch = async (entities, queryType, year) => {
  if (!year && queryType === 'lobbyist') {
    return []
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
      results: [],
      year: null,
      requestedYear: null,
      actualYear: null,
      fellBack: false,
      latestYearChecked: null
    }
  }

  const latestResults = await runDetailSearch(entities, queryType, latestYear)
  if (latestResults.length) {
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
    if (results.length) {
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
    results: [],
    year: latestYear,
    requestedYear: null,
    actualYear: latestYear,
    fellBack: false,
    latestYearChecked: latestYear
  }
}
