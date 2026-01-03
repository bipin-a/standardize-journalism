// In-Memory Token Bucket Rate Limiter
// No Redis/external dependencies needed for MVP

// Rate limit configuration (20 messages/minute for educational use)
const MAX_TOKENS = 20 // Maximum messages per window
const REFILL_RATE = 20 // Tokens added per minute
const WINDOW_MS = 60 * 1000 // 1 minute window

// In-memory storage
const rateLimitStore = new Map()

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateLimitStore.entries()) {
    // Remove buckets inactive for more than 5 minutes
    if (now - bucket.lastRefill > 5 * WINDOW_MS) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * WINDOW_MS)

/**
 * Check if a client is allowed to make a request based on token bucket algorithm
 * @param {string} clientId - Unique identifier for the client (IP + User-Agent)
 * @returns {{allowed: boolean, retryAfter?: number}} Result object
 */
export function checkRateLimit(clientId) {
  const now = Date.now()

  // Get or create bucket for this client
  let bucket = rateLimitStore.get(clientId)

  if (!bucket) {
    // New client - create bucket with full tokens
    bucket = {
      tokens: MAX_TOKENS,
      lastRefill: now
    }
    rateLimitStore.set(clientId, bucket)
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill
  const tokensToAdd = Math.floor(elapsed / WINDOW_MS) * REFILL_RATE

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }

  // Check if tokens available
  if (bucket.tokens > 0) {
    bucket.tokens -= 1
    return { allowed: true }
  }

  // Calculate when next token will be available
  const tokensNeeded = 1
  const msPerToken = WINDOW_MS / REFILL_RATE
  const retryAfter = Math.ceil(msPerToken / 1000) // Convert to seconds

  return {
    allowed: false,
    retryAfter
  }
}

/**
 * Clear rate limit for a specific client (useful for testing/admin)
 * @param {string} clientId - Client identifier
 */
export function clearRateLimit(clientId) {
  rateLimitStore.delete(clientId)
}

/**
 * Get current rate limit stats for a client (useful for debugging)
 * @param {string} clientId - Client identifier
 * @returns {{tokens: number, maxTokens: number, lastRefill: number} | null}
 */
export function getRateLimitStats(clientId) {
  const bucket = rateLimitStore.get(clientId)
  if (!bucket) return null

  return {
    tokens: bucket.tokens,
    maxTokens: MAX_TOKENS,
    lastRefill: bucket.lastRefill,
    nextRefillIn: WINDOW_MS - (Date.now() - bucket.lastRefill)
  }
}
