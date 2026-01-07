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

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,        // Open circuit after N consecutive failures
  resetTimeoutMs: 30000,      // Try again after 30s in half-open state
  backoffBaseMs: 1000,        // Base delay for exponential backoff
  backoffMaxMs: 16000         // Max delay cap
}

// In-memory circuit state (per-endpoint)
const circuitState = new Map()

const getCircuitKey = (url) => {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname.split('/').slice(0, 3).join('/')}`
  } catch {
    return url
  }
}

const getCircuit = (key) => {
  if (!circuitState.has(key)) {
    circuitState.set(key, {
      failures: 0,
      state: 'closed',      // closed | open | half-open
      lastFailure: null,
      nextAttempt: null
    })
  }
  return circuitState.get(key)
}

const recordSuccess = (key) => {
  const circuit = getCircuit(key)
  circuit.failures = 0
  circuit.state = 'closed'
  circuit.lastFailure = null
  circuit.nextAttempt = null
}

const recordFailure = (key, error) => {
  const circuit = getCircuit(key)
  circuit.failures += 1
  circuit.lastFailure = Date.now()

  const backoffDelay = Math.min(
    CIRCUIT_BREAKER_CONFIG.backoffBaseMs * Math.pow(2, circuit.failures - 1),
    CIRCUIT_BREAKER_CONFIG.backoffMaxMs
  )
  circuit.nextAttempt = Date.now() + backoffDelay

  if (circuit.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    circuit.state = 'open'
    circuit.nextAttempt = Date.now() + CIRCUIT_BREAKER_CONFIG.resetTimeoutMs

    // Structured alert for monitoring
    console.error(JSON.stringify({
      level: 'error',
      event: 'circuit_breaker_open',
      circuitKey: key,
      failures: circuit.failures,
      errorMessage: error?.message,
      nextAttemptAt: new Date(circuit.nextAttempt).toISOString(),
      timestamp: new Date().toISOString()
    }))
  }

  return circuit
}

const canAttemptRequest = (key) => {
  const circuit = getCircuit(key)

  if (circuit.state === 'closed') {
    return true
  }

  if (circuit.state === 'open' && Date.now() >= circuit.nextAttempt) {
    circuit.state = 'half-open'
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'circuit_breaker_half_open',
      circuitKey: key,
      timestamp: new Date().toISOString()
    }))
    return true
  }

  if (circuit.state === 'half-open') {
    return true
  }

  return false
}

// ============================================================================
// Core Data Fetching
// ============================================================================

const fetchJson = async (url, label) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label || 'data'} from ${url}: ${response.status}`)
  }
  return response.json()
}

const fetchWithCircuitBreaker = async (url, label) => {
  const circuitKey = getCircuitKey(url)

  if (!canAttemptRequest(circuitKey)) {
    const circuit = getCircuit(circuitKey)
    const retryIn = Math.ceil((circuit.nextAttempt - Date.now()) / 1000)
    throw new Error(`Circuit open for ${label || url}, retry in ${retryIn}s`)
  }

  try {
    const data = await fetchJson(url, label)
    recordSuccess(circuitKey)
    return data
  } catch (error) {
    recordFailure(circuitKey, error)
    throw error
  }
}

const readLocalJson = async (relativePath) => {
  const fileContent = await readFile(join(process.cwd(), relativePath), 'utf-8')
  return JSON.parse(fileContent)
}

const annotateSource = (data, { source, label, circuitState: circuitInfo }) => {
  if (data && typeof data === 'object') {
    data._source = {
      source,
      label: label || 'unknown',
      fetchedAt: Date.now(),
      fallback: source !== 'remote',
      ...(circuitInfo && { circuitState: circuitInfo })
    }
  }
  return data
}

const loadJsonWithFallback = async (url, localPath, label) => {
  if (url) {
    const circuitKey = getCircuitKey(url)
    try {
      const data = await fetchWithCircuitBreaker(url, label)
      return annotateSource(data, { source: 'remote', label })
    } catch (error) {
      const circuit = getCircuit(circuitKey)
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'remote_fetch_fallback',
        label: label || 'data',
        errorMessage: error.message,
        circuitState: circuit.state,
        failures: circuit.failures,
        timestamp: new Date().toISOString()
      }))
    }
  }

  if (localPath) {
    try {
      const data = await readLocalJson(localPath)
      const circuitKey = url ? getCircuitKey(url) : null
      const circuit = circuitKey ? getCircuit(circuitKey) : null
      return annotateSource(data, {
        source: 'local_fallback',
        label: label || localPath,
        circuitState: circuit?.state
      })
    } catch (error) {
      console.warn(`Local ${label || 'data'} unavailable:`, error.message)
    }
  }

  return null
}

// Export circuit state getter for health checks / debugging
export const getCircuitBreakerStatus = () => {
  const status = {}
  for (const [key, circuit] of circuitState.entries()) {
    status[key] = {
      state: circuit.state,
      failures: circuit.failures,
      lastFailure: circuit.lastFailure ? new Date(circuit.lastFailure).toISOString() : null,
      nextAttempt: circuit.nextAttempt ? new Date(circuit.nextAttempt).toISOString() : null
    }
  }
  return status
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
  const data = await loadJsonWithFallback(config.url, config.local, `${dataset} trends`)

  // Guarantee trends carry source metadata so downstream UIs can show fallback badges
  if (data && !data._source) {
    annotateSource(data, { source: 'unknown', label: `${dataset} trends` })
  }

  return data
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
