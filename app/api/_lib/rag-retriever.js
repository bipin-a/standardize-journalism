import { readFile } from 'fs/promises'
import { join } from 'path'
import { getGcsBaseUrl, getRagIndexUrl } from './gcs-urls'

const CACHE_TTL_MS = 60 * 60 * 1000
let cachedIndex = null
let cachedAt = 0
let warnedScoreConfig = false

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

const loadEmbeddingIndex = async () => {
  if (cachedIndex && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedIndex
  }

  const indexUrl = getRagIndexUrl()
  try {
    cachedIndex = await fetchJson(indexUrl)
    cachedAt = Date.now()
    return cachedIndex
  } catch (error) {
    console.warn(`RAG index fetch failed, falling back to local: ${error.message}`)
  }

  try {
    cachedIndex = await readLocalJson('data/gold/rag/index.json')
    cachedAt = Date.now()
    return cachedIndex
  } catch (error) {
    console.warn(`RAG index local fallback failed: ${error.message}`)
  }

  return null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getQueryEmbedding = async (query, maxRetries = 3) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embeddings.')
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: query
      })
    })

    if (response.ok) {
      const payload = await response.json()
      const embedding = payload?.data?.[0]?.embedding
      if (!embedding) {
        throw new Error('Embedding response missing vector.')
      }
      return embedding
    }

    const errorText = await response.text()
    const shouldRetry = response.status >= 500 || response.status === 429
    if (!shouldRetry || attempt === maxRetries - 1) {
      throw new Error(`Embedding request failed: ${response.status} ${errorText}`)
    }

    await sleep(500 * (attempt + 1))
  }

  throw new Error('Embedding request failed after retries.')
}

const cosineSimilarity = (a, b) => {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (!normA || !normB) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

const resolveMinScore = (fallback) => {
  const raw = process.env.RAG_MIN_SIMILARITY_SCORE
  if (!raw) {
    if (!warnedScoreConfig) {
      console.warn(`RAG_MIN_SIMILARITY_SCORE not set; using default ${fallback}`)
      warnedScoreConfig = true
    }
    return fallback
  }

  const parsed = parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    if (!warnedScoreConfig) {
      console.warn(`RAG_MIN_SIMILARITY_SCORE invalid ("${raw}"); using default ${fallback}`)
      warnedScoreConfig = true
    }
    return fallback
  }

  return parsed
}

export const semanticSearch = async (query, k = 5, minScore = 0.65) => {
  const threshold = resolveMinScore(minScore)
  const index = await loadEmbeddingIndex()
  if (!index || !Array.isArray(index.chunks)) {
    return {
      chunks: [],
      sources: [],
      dataTypes: [],
      scores: [],
      failureReason: 'rag_index_missing',
      failureDetail: 'Embedding index missing or invalid.'
    }
  }

  let queryEmbedding
  try {
    queryEmbedding = await getQueryEmbedding(query)
  } catch (error) {
    console.warn(`Embedding lookup failed: ${error.message}`)
    return {
      chunks: [],
      sources: [],
      dataTypes: [],
      scores: [],
      failureReason: 'embedding_lookup_failed',
      failureDetail: error.message
    }
  }

  const scored = index.chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding || [])
    }))

  const maxScore = scored.reduce((max, chunk) => Math.max(max, chunk.score), 0)
  const filtered = scored
    .filter((chunk) => chunk.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  if (!filtered.length) {
    return {
      chunks: [],
      sources: [],
      dataTypes: [],
      scores: [],
      failureReason: 'no_embeddings_hits',
      failureDetail: `No chunks >= ${threshold}. maxScore=${maxScore.toFixed(3)} indexChunks=${index.chunks.length}`
    }
  }

  const baseUrl = getGcsBaseUrl()
  const sources = filtered.map((chunk) => ({
    type: chunk.metadata?.type,
    year: chunk.metadata?.year,
    path: chunk.metadata?.source ? `${baseUrl}/${chunk.metadata.source}` : null,
    score: chunk.score
  }))
  const dataTypes = [...new Set(filtered.map((chunk) => chunk.metadata?.type).filter(Boolean))]
  const scores = filtered.map((chunk) => chunk.score)

  return {
    chunks: filtered,
    sources,
    dataTypes,
    scores
  }
}
