const normalizeToken = (token) =>
  String(token || '')
    .toLowerCase()
    .replace(/[^a-z']/g, '')
    .trim()

const tokenize = (text) => {
  const raw = String(text || '')
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
  return Array.from(new Set(raw))
}

const normalizeFull = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()

export function canonicalizeCouncillorName(input, candidates = []) {
  const raw = String(input || '').trim()
  if (!raw) return null

  const normalized = normalizeFull(raw)
  const cleanedCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : []

  // 1) Case-insensitive exact match
  for (const candidate of cleanedCandidates) {
    if (normalizeFull(candidate) === normalized) {
      return candidate
    }
  }

  const inputTokens = tokenize(raw)
  if (!inputTokens.length) return null

  // If user only gave one token (e.g., last name), only accept if it uniquely identifies a councillor.
  if (inputTokens.length === 1) {
    const token = inputTokens[0]
    let match = null
    let matches = 0
    for (const candidate of cleanedCandidates) {
      const tokens = tokenize(candidate)
      if (tokens.includes(token)) {
        match = candidate
        matches += 1
        if (matches > 1) break
      }
    }
    return matches === 1 ? match : null
  }

  // 2) Token overlap score
  let best = null
  let bestScore = 0
  let bestCandidateTokens = 0

  for (const candidate of cleanedCandidates) {
    const candidateTokens = tokenize(candidate)
    if (!candidateTokens.length) continue

    let overlap = 0
    for (const token of inputTokens) {
      if (candidateTokens.includes(token)) overlap += 1
    }

    if (overlap > bestScore) {
      bestScore = overlap
      best = candidate
      bestCandidateTokens = candidateTokens.length
    } else if (overlap === bestScore && overlap > 0 && best) {
      // Tie-breaker: prefer the candidate with fewer tokens (more specific match)
      if (candidateTokens.length < bestCandidateTokens) {
        best = candidate
        bestCandidateTokens = candidateTokens.length
      }
    }
  }

  return bestScore >= 2 ? best : null
}
