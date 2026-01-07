import pdfParse from 'pdf-parse'

const ALLOWED_DOMAINS = ['toronto.ca', 'ontario.ca', 'canada.ca']
const HTML_CACHE_TTL_MS = 60 * 60 * 1000
const PDF_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_LOOKUPS_PER_CONVERSATION = 5
const MAX_RESULTS = 3
const MAX_TEXT_CHARS = 12000
const FETCH_TIMEOUT_MS = 12000
const USER_AGENT = 'Mozilla/5.0 (compatible; StandardizeJournalismBot/1.0)'
const ONTARIO_SEARCH_PAGE_URL = 'https://www.ontario.ca/search/search-results/'
const CANADA_SEARCH_PAGE_URL = 'https://www.canada.ca/en/sr/srb.html'
const ONTARIO_CONFIG_TTL_MS = 24 * 60 * 60 * 1000
const CANADA_CONFIG_TTL_MS = 60 * 60 * 1000
const ONTARIO_SEARCH_FALLBACK = {
  endpointBase: 'https://www.ontario.ca',
  engineName: 'ontarioca-search-prod-meta',
  searchKey: 'search-tnzginds9fgf1g4gis56m8vn'
}

const pageCache = new Map()
const lookupUsage = new Map()
const searchConfigCache = {
  ontario: { value: null, fetchedAt: 0 },
  canada: { value: null, fetchedAt: 0 }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of pageCache.entries()) {
    if (entry.expiresAt <= now) {
      pageCache.delete(key)
    }
  }
  for (const [key, entry] of lookupUsage.entries()) {
    if (now - entry.startedAt > LOOKUP_WINDOW_MS) {
      lookupUsage.delete(key)
    }
  }
}, 10 * 60 * 1000)

const isAllowedHost = (host) => {
  if (!host) return false
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

const isAllowedUrl = (url) => {
  try {
    const parsed = new URL(url)
    return isAllowedHost(parsed.hostname)
  } catch (error) {
    return false
  }
}

const normalizeUrl = (url) => {
  try {
    const normalized = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`
    const parsed = new URL(normalized)
    parsed.hash = ''
    return parsed.toString()
  } catch (error) {
    return url
  }
}

const decodeDuckDuckGoUrl = (url) => {
  try {
    const normalized = url.startsWith('//') ? `https:${url}` : url
    const parsed = new URL(normalized)
    if (parsed.hostname.includes('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
      const target = parsed.searchParams.get('uddg')
      if (target) {
        return decodeURIComponent(target)
      }
    }
    return normalized
  } catch (error) {
    return url
  }
}

const stripHtml = (html) => {
  if (!html) return ''
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

const decodeHtmlEntities = (value) => {
  if (!value) return ''
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

const truncateText = (text, limit = MAX_TEXT_CHARS) => {
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trim()}...`
}

const extractTitle = (html) => {
  if (!html) return null
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (!match || !match[1]) return null
  return match[1].trim()
}

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

const getCachedSearchConfig = (key, ttlMs) => {
  const cached = searchConfigCache[key]
  if (!cached?.value) return null
  if (Date.now() - cached.fetchedAt > ttlMs) return null
  return cached.value
}

const setCachedSearchConfig = (key, value) => {
  searchConfigCache[key] = { value, fetchedAt: Date.now() }
}

const extractHtmlAttribute = (html, attrName) => {
  if (!html) return null
  const pattern = new RegExp(`${attrName}=(['"])([\\s\\S]*?)\\1`, 'i')
  const match = html.match(pattern)
  return match?.[2] ? match[2].trim() : null
}

const extractOntarioScriptUrl = (html) => {
  if (!html) return null
  const match = html.match(/<script[^>]+src="([^"]*static\/js\/main[^"]+\.js)"/i)
  if (!match || !match[1]) return null
  try {
    return new URL(match[1], ONTARIO_SEARCH_PAGE_URL).toString()
  } catch (error) {
    return null
  }
}

const parseOntarioSearchConfig = (scriptText) => {
  if (!scriptText) return null
  const keyMatches = scriptText.match(/search-[a-z0-9]{20,}/gi) || []
  const searchKey = [...keyMatches].sort((a, b) => b.length - a.length)[0] || null
  const engineMatch = scriptText.match(/ontarioca-search-prod-[a-z0-9-]+/i)
  const engineName = engineMatch ? engineMatch[0] : null
  return {
    endpointBase: 'https://www.ontario.ca',
    engineName,
    searchKey
  }
}

const getOntarioSearchConfig = async () => {
  const cached = getCachedSearchConfig('ontario', ONTARIO_CONFIG_TTL_MS)
  if (cached) return cached
  try {
    const pageResponse = await fetchWithTimeout(ONTARIO_SEARCH_PAGE_URL, {
      headers: { 'User-Agent': USER_AGENT }
    })
    if (!pageResponse.ok) {
      throw new Error(`Ontario search page failed (${pageResponse.status})`)
    }
    const pageHtml = await pageResponse.text()
    const scriptUrl = extractOntarioScriptUrl(pageHtml)
    if (!scriptUrl) {
      throw new Error('Ontario search script not found')
    }
    const scriptResponse = await fetchWithTimeout(scriptUrl, {
      headers: { 'User-Agent': USER_AGENT }
    })
    if (!scriptResponse.ok) {
      throw new Error(`Ontario search script failed (${scriptResponse.status})`)
    }
    const scriptText = await scriptResponse.text()
    const config = parseOntarioSearchConfig(scriptText)
    if (!config?.searchKey || !config?.engineName) {
      throw new Error('Ontario search config missing')
    }
    setCachedSearchConfig('ontario', config)
    return config
  } catch (error) {
    setCachedSearchConfig('ontario', ONTARIO_SEARCH_FALLBACK)
    return ONTARIO_SEARCH_FALLBACK
  }
}

const getCanadaSearchConfig = async () => {
  const cached = getCachedSearchConfig('canada', CANADA_CONFIG_TTL_MS)
  if (cached) return cached
  const response = await fetchWithTimeout(`${CANADA_SEARCH_PAGE_URL}?q=search`, {
    headers: { 'User-Agent': USER_AGENT }
  })
  if (!response.ok) {
    throw new Error(`Canada search page failed (${response.status})`)
  }
  const html = await response.text()
  const rawConfig = extractHtmlAttribute(html, 'data-gc-search')
  if (!rawConfig) {
    throw new Error('Canada search config not found')
  }
  const parsed = JSON.parse(decodeHtmlEntities(rawConfig))
  const config = {
    organizationId: parsed.organizationId || null,
    accessToken: parsed.accessToken || null,
    searchHub: parsed.searchHub || null
  }
  if (!config.organizationId || !config.accessToken) {
    throw new Error('Canada search config incomplete')
  }
  setCachedSearchConfig('canada', config)
  return config
}

const readCached = (url) => {
  const cached = pageCache.get(url)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    pageCache.delete(url)
    return null
  }
  return cached
}

const writeCache = (url, entry) => {
  pageCache.set(url, entry)
}

const recordLookup = (conversationId) => {
  const key = conversationId || 'anonymous'
  const now = Date.now()
  const record = lookupUsage.get(key)
  if (!record || now - record.startedAt > LOOKUP_WINDOW_MS) {
    lookupUsage.set(key, { count: 1, startedAt: now })
    return { allowed: true, remaining: MAX_LOOKUPS_PER_CONVERSATION - 1 }
  }
  if (record.count >= MAX_LOOKUPS_PER_CONVERSATION) {
    return { allowed: false, remaining: 0 }
  }
  record.count += 1
  lookupUsage.set(key, record)
  return { allowed: true, remaining: MAX_LOOKUPS_PER_CONVERSATION - record.count }
}

const extractUrlsFromDuckDuckGo = (html) => {
  if (!html) return []
  const urls = []
  const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    if (match[1]) {
      urls.push(match[1])
    }
  }
  if (urls.length) return urls
  const fallbackRegex = /href="(https?:\/\/[^"]+)"/gi
  while ((match = fallbackRegex.exec(html)) !== null) {
    if (match[1]) {
      urls.push(match[1])
    }
  }
  return urls
}

const searchDuckDuckGo = async (query) => {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Search failed (${response.status})`)
  }
  const html = await response.text()
  return extractUrlsFromDuckDuckGo(html)
}

const searchToronto = async (query) => {
  const searchUrl = `https://find.toronto.ca/rest/v2/api/search?cname=www1&query=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Toronto search failed (${response.status})`)
  }
  const payload = await response.json()
  const results = Array.isArray(payload?.result) ? payload.result : []
  return results.map((item) => item.url).filter(Boolean)
}

const searchOntario = async (query) => {
  const config = await getOntarioSearchConfig()
  const endpointBase = (config?.endpointBase || ONTARIO_SEARCH_FALLBACK.endpointBase).replace(/\/$/, '')
  const endpoint = `${endpointBase}/api/as/v1/engines/${config.engineName}/search.json`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.searchKey}`
    },
    body: JSON.stringify({
      query,
      page: { size: MAX_RESULTS }
    })
  })
  if (!response.ok) {
    throw new Error(`Ontario search failed (${response.status})`)
  }
  const payload = await response.json()
  const results = Array.isArray(payload?.results) ? payload.results : []
  return results
    .map((item) => item?.url?.raw || item?.url)
    .filter(Boolean)
}

const searchCanada = async (query) => {
  const config = await getCanadaSearchConfig()
  const endpoint = `https://${config.organizationId}.org.coveo.com/rest/search/v2`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`
    },
    body: JSON.stringify({
      q: query,
      numberOfResults: MAX_RESULTS,
      firstResult: 0,
      searchHub: config.searchHub || 'canada-gouv-public-websites'
    })
  })
  if (!response.ok) {
    throw new Error(`Canada search failed (${response.status})`)
  }
  const payload = await response.json()
  const results = Array.isArray(payload?.results) ? payload.results : []
  return results.map((item) => item?.clickUri).filter(Boolean)
}

const searchDomain = async (domain, query) => {
  if (domain === 'toronto.ca') {
    return searchToronto(query)
  }
  if (domain === 'ontario.ca') {
    return searchOntario(query)
  }
  if (domain === 'canada.ca') {
    return searchCanada(query)
  }
  return searchDuckDuckGo(`site:${domain} ${query}`)
}

const findSearchResults = async (query) => {
  const allUrls = []
  for (const domain of ALLOWED_DOMAINS) {
    try {
      const results = await searchDomain(domain, query)
      allUrls.push(...results)
    } catch (error) {
      // Ignore search failures for individual domains
    }
  }
  const unique = new Set()
  const allowed = []
  for (const raw of allUrls) {
    const decoded = decodeDuckDuckGoUrl(raw)
    if (!decoded) continue
    const normalized = normalizeUrl(decoded)
    if (!isAllowedUrl(normalized)) continue
    if (unique.has(normalized)) continue
    unique.add(normalized)
    allowed.push(normalized)
    if (allowed.length >= MAX_RESULTS) break
  }
  return allowed
}

const fetchWebDocument = async (url) => {
  const cached = readCached(url)
  if (cached) {
    return { ...cached, cached: true }
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''
  const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')
  let text = ''
  let title = null

  if (isPdf) {
    const buffer = Buffer.from(await response.arrayBuffer())
    const parsed = await pdfParse(buffer)
    text = parsed.text || ''
    title = parsed.info?.Title ? String(parsed.info.Title).trim() : null
  } else {
    const html = await response.text()
    title = extractTitle(html)
    text = stripHtml(html)
  }

  text = truncateText(text)
  const entry = {
    url,
    title,
    text,
    contentType: isPdf ? 'pdf' : 'html',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + (isPdf ? PDF_CACHE_TTL_MS : HTML_CACHE_TTL_MS)
  }
  writeCache(url, entry)
  return entry
}

export async function lookupWebSources({ query, url, conversationId }) {
  const cleanedQuery = query ? String(query).replace(/\s+/g, ' ').trim() : ''
  const limitCheck = recordLookup(conversationId)
  if (!limitCheck.allowed) {
    return {
      result: null,
      sources: [],
      failureReason: 'rate_limited',
      failureDetail: 'Web lookup limit reached for this conversation.'
    }
  }

  let urls = []
  if (url) {
    const normalized = normalizeUrl(url)
    if (!isAllowedUrl(normalized)) {
      return {
        result: null,
        sources: [],
        failureReason: 'disallowed_domain',
        failureDetail: 'URL is outside the allowlist.'
      }
    }
    urls = [normalized]
  } else if (cleanedQuery) {
    urls = await findSearchResults(cleanedQuery)
  }

  if (!urls.length) {
    return {
      result: null,
      sources: [],
      failureReason: 'no_web_results',
      failureDetail: 'No allowlisted web results found.'
    }
  }

  const documents = []
  const failedUrls = []
  for (const target of urls) {
    try {
      const doc = await fetchWebDocument(target)
      if (doc.text) {
        documents.push(doc)
      }
    } catch (error) {
      console.warn('[web_fetch_failed]', { url: target, error: error.message })
      failedUrls.push({ url: target, reason: error.message })
    }
    if (documents.length >= MAX_RESULTS) break
  }

  if (!documents.length) {
    return {
      result: null,
      sources: [],
      failureReason: 'fetch_failed',
      failureDetail: failedUrls.length
        ? `Unable to fetch any web documents. Tried ${failedUrls.length} URLs; first error: ${failedUrls[0].reason}`
        : 'Unable to fetch any web documents.'
    }
  }

  const context = documents.map((doc, index) => {
    const title = doc.title || `Source ${index + 1}`
    return `${title}\nURL: ${doc.url}\n${doc.text}`
  }).join('\n\n---\n\n')

  const sources = documents.map((doc) => ({
    type: 'Web',
    path: doc.url,
    title: doc.title || null
  }))

  return {
    result: {
      query: cleanedQuery || query || null,
      context,
      documents: documents.map((doc) => ({
        url: doc.url,
        title: doc.title,
        contentType: doc.contentType,
        cached: Boolean(doc.cached)
      }))
    },
    sources
  }
}
