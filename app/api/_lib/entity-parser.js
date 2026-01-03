const CATEGORY_KEYWORDS = [
  'transit',
  'transportation',
  'housing',
  'parks',
  'recreation',
  'infrastructure',
  'water',
  'fire',
  'police',
  'shelter',
  'library',
  'childcare'
]

const PROGRAM_KEYWORDS = [
  'ttc',
  'streetcar',
  'subway',
  'bus',
  'police',
  'fire',
  'paramedic',
  'housing',
  'parks',
  'library'
]

const STOP_WORDS = new Set([
  'show', 'me', 'all', 'the', 'a', 'an', 'in', 'for', 'of', 'on', 'and', 'to',
  'projects', 'project', 'motions', 'motion', 'votes', 'vote', 'council', 'ward',
  'by', 'with', 'about', 'from', 'is', 'are', 'was', 'were', 'it', 'this', 'that',
  'how', 'much', 'did', 'get', 'got'
])

const extractWard = (message) => {
  const match = message.match(/ward\s*#?\s*(\d{1,2})/i)
  return match ? parseInt(match[1], 10) : null
}

const extractYear = (message) => {
  const match = message.match(/\b(20\d{2})\b/)
  return match ? parseInt(match[1], 10) : null
}

const extractCategory = (message) => {
  const lower = message.toLowerCase()
  return CATEGORY_KEYWORDS.find((keyword) => lower.includes(keyword)) || null
}

const extractProgram = (message) => {
  const lower = message.toLowerCase()
  return PROGRAM_KEYWORDS.find((keyword) => lower.includes(keyword)) || null
}

const extractCouncillor = (message) => {
  const match = message.match(/councillor\s+([a-z'\-]+(?:\s+[a-z'\-]+)?)/i)
  return match ? match[1].trim() : null
}

const extractKeyword = (message) => {
  const lower = message.toLowerCase()
  const cleaned = lower
    .replace(/\b(20\d{2})\b/g, ' ')
    .replace(/ward\s*#?\s*\d{1,2}/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))

  if (!cleaned.length) {
    return null
  }

  return cleaned.slice(0, 3).join(' ')
}

export const parseEntities = (message) => {
  const ward = extractWard(message)
  const year = extractYear(message)
  const category = extractCategory(message)
  const program = extractProgram(message)
  const councillor = extractCouncillor(message)
  let keyword = extractKeyword(message)

  if (keyword) {
    const keywordLower = keyword.toLowerCase()
    if (category && keywordLower === category.toLowerCase()) {
      keyword = null
    } else if (program && keywordLower === program.toLowerCase()) {
      keyword = null
    }
  }

  return {
    ward,
    year,
    category,
    program,
    councillor,
    keyword
  }
}

export const hasDetailEntities = (entities) =>
  Boolean(
    entities.ward ||
    entities.category ||
    entities.program ||
    entities.councillor
  )
