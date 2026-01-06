// Mechanical extractions only - semantic understanding delegated to LLM
// Keep only fast, deterministic regex patterns for structured data (ward numbers, years)

const extractWard = (message) => {
  const match = message.match(/ward\s*#?\s*(\d{1,2})/i)
  return match ? parseInt(match[1], 10) : null
}

const extractYear = (message) => {
  const match = message.match(/\b(20\d{2})\b/)
  return match ? parseInt(match[1], 10) : null
}

const extractCouncillor = (message) => {
  // Lightweight extraction - looks for "councillor/mayor [Name]" pattern
  // Full name matching/canonicalization happens downstream using actual voting data
  const match = message.match(/\b(?:councillor|mayor)\s+([a-z'\-]+(?:\s+[a-z'\-]+){0,2})/i)
  return match ? match[1].trim() : null
}

// Simple helper to detect council-related queries
// Used to decide whether to apply councillor canonicalization downstream
const isCouncilQuery = (message) => {
  const lower = String(message || '').toLowerCase()
  return lower.includes('council') || lower.includes('motion') || lower.includes('vote') || lower.includes('councillor')
}

export const parseEntities = (message) => {
  // Fast mechanical extractions only
  // For semantic entities (category, program, keyword), use extractEntitiesWithLLM instead
  const ward = extractWard(message)
  const year = extractYear(message)
  const councillor = extractCouncillor(message)

  return {
    ward,
    year,
    councillor,
    // Semantic fields - will be populated by LLM extraction if needed
    category: null,
    program: null,
    keyword: null
  }
}

export const hasDetailEntities = (entities) =>
  Boolean(
    entities.ward ||
    entities.category ||
    entities.program ||
    entities.councillor
  )
