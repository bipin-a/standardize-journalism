import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  getCapitalDataUrl,
  getFinancialReturnUrl,
  getGcsBaseUrl,
  getLobbyistDataUrl,
  getOperatingBudgetUrl,
  getVotingDataUrl
} from './gcs-urls'

const fetchJson = async (url, label) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label || 'data'} from ${url}: ${response.status}`)
  }
  return response.json()
}

const readLocalJson = async (relativePath) => {
  const fileContent = await readFile(join(process.cwd(), relativePath), 'utf-8')
  return JSON.parse(fileContent)
}

const loadJsonWithFallback = async (url, localPath, label) => {
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

const getProcessedConfig = (dataset) => {
  const baseUrl = getGcsBaseUrl()

  const configs = {
    capital: {
      folder: 'capital-by-ward',
      latestUrl: getCapitalDataUrl(),
      latestLocal: 'data/processed/capital_by_ward.json',
      label: 'capital processed'
    },
    council: {
      folder: 'council-voting',
      latestUrl: getVotingDataUrl(),
      latestLocal: 'data/processed/council_voting.json',
      label: 'council processed'
    },
    'money-flow': {
      folder: 'financial-return',
      latestUrl: getFinancialReturnUrl(),
      latestLocal: 'data/processed/financial_return.json',
      label: 'financial return'
    },
    'operating-budget': {
      folder: 'operating-budget',
      latestUrl: getOperatingBudgetUrl(),
      latestLocal: 'data/processed/operating_budget.json',
      label: 'operating budget'
    },
    lobbyist: {
      folder: 'lobbyist-registry',
      latestUrl: getLobbyistDataUrl(),
      latestLocal: 'data/processed/lobbyist_activity.json',
      label: 'lobbyist registry'
    },
    'council-motions': {
      folder: 'council-motions',
      latestUrl: `${baseUrl}/processed/latest/council_motions.json`,
      latestLocal: 'data/processed/council_motions.json',
      label: 'council motions'
    }
  }

  return configs[dataset] || null
}

export const loadTrendsFile = async (dataset) => {
  const baseUrl = getGcsBaseUrl()
  const map = {
    'money-flow': {
      url: `${baseUrl}/gold/money-flow/trends.json`,
      local: 'data/gold/money-flow/trends.json'
    },
    capital: {
      url: `${baseUrl}/gold/capital/trends.json`,
      local: 'data/gold/capital/trends.json'
    },
    council: {
      url: `${baseUrl}/gold/council-decisions/trends.json`,
      local: 'data/gold/council-decisions/trends.json'
    },
    lobbyist: {
      url: `${baseUrl}/gold/lobbyist-registry/trends.json`,
      local: 'data/gold/lobbyist-registry/trends.json'
    }
  }

  const config = map[dataset]
  if (!config) {
    return null
  }

  return loadJsonWithFallback(config.url, config.local, `${dataset} trends`)
}

export const loadGoldIndexFile = async (dataset) => {
  const baseUrl = getGcsBaseUrl()
  const map = {
    'council-motions': {
      url: `${baseUrl}/gold/council-motions/index.json`,
      local: 'data/gold/council-motions/index.json'
    }
  }

  const config = map[dataset]
  if (!config) {
    return null
  }

  return loadJsonWithFallback(config.url, config.local, `${dataset} index`)
}

export const loadProcessedFile = async (dataset, year, { fallbackToLatest = true } = {}) => {
  const config = getProcessedConfig(dataset)
  if (!config) {
    return null
  }

  if (year) {
    const url = `${getGcsBaseUrl()}/processed/${config.folder}/${year}.json`
    const localPath = `data/processed/${config.folder}/${year}.json`
    const data = await loadJsonWithFallback(url, localPath, `${dataset} ${year}`)
    if (data || !fallbackToLatest) {
      return data
    }
  }

  return loadJsonWithFallback(config.latestUrl, config.latestLocal, `${dataset} latest`)
}

export const resolveYearList = ({ years, windowYears, trends }) => {
  if (Array.isArray(years) && years.length) {
    return years
  }

  const availableYears = Array.isArray(trends?.availableYears)
    ? [...trends.availableYears]
    : Array.isArray(trends?.years)
      ? [...trends.years]
      : trends?.byYear
        ? Object.keys(trends.byYear).map(Number)
        : []

  const currentYear = new Date().getFullYear()
  const cappedYears = availableYears.filter((year) => Number(year) <= currentYear)
  const effectiveYears = cappedYears.length ? cappedYears : availableYears

  if (windowYears && effectiveYears.length) {
    effectiveYears.sort((a, b) => a - b)
    return effectiveYears.slice(-windowYears)
  }

  if (effectiveYears.length) {
    effectiveYears.sort((a, b) => a - b)
    return [effectiveYears[effectiveYears.length - 1]]
  }

  return []
}

const CATEGORY_ALIASES = {
  transit: 'transportation',
  transportation: 'transportation',
  ttc: 'transportation',
  subway: 'transportation',
  streetcar: 'transportation',
  bus: 'transportation',
  road: 'transportation',
  roads: 'transportation'
}

export const normalizeCategoryFilter = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value).trim()
  if (!text) {
    return null
  }
  const key = text.toLowerCase()
  return CATEGORY_ALIASES[key] || text
}

export const applyFilters = (records, filters = {}) => {
  const normalizedCategory = normalizeCategoryFilter(filters.category)
  const normalizedCategoryValue = normalizedCategory ? String(normalizedCategory).toLowerCase() : null
  const normalizedCouncillor = filters.councillor ? String(filters.councillor).toLowerCase() : null
  const normalizedSubject = filters.subject ? String(filters.subject).toLowerCase() : null

  return records.filter((record) => {
    if (filters.ward && Number(record.ward_number) !== Number(filters.ward)) {
      return false
    }

    if (normalizedCategoryValue) {
      const candidates = [
        record.category,
        record.motion_category,
        record.subject_category,
        record.program_name,
        record.project_name
      ]
      const match = candidates
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedCategoryValue))
      if (!match) {
        return false
      }
    }

    if (normalizedCouncillor) {
      const votes = Array.isArray(record.votes) ? record.votes : []
      const match = votes.some((vote) =>
        String(vote.councillor_name || '').toLowerCase().includes(normalizedCouncillor)
      )
      if (!match) {
        return false
      }
    }

    if (normalizedSubject) {
      const candidates = [record.subject_matter, record.subject_category]
      const match = candidates
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSubject))
      if (!match) {
        return false
      }
    }

    return true
  })
}
