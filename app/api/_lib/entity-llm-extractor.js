import { getLLMProvider } from './llm-providers'

const extractJsonPayload = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1]) {
    return fence[1].trim()
  }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return null
}

const safeParseJson = (raw) => {
  const payload = extractJsonPayload(raw)
  if (!payload) return null
  try {
    return JSON.parse(payload)
  } catch (error) {
    return null
  }
}

const toNullableInt = (value) => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.trunc(num)
  return rounded
}

const toNullableString = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length ? text : null
}

const normalizeEntities = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const ward = toNullableInt(raw.ward)
  const year = toNullableInt(raw.year)

  const category = toNullableString(raw.category)
  const program = toNullableString(raw.program)
  const councillor = toNullableString(raw.councillor)
  const keyword = toNullableString(raw.keyword)

  return {
    ward: ward && ward > 0 && ward < 100 ? ward : null,
    year: year && year >= 2000 && year <= 2100 ? year : null,
    category,
    program,
    councillor,
    keyword
  }
}

const ENTITY_EXTRACTION_PROMPT = `You extract structured entities for a Toronto civic data assistant.

Return JSON only (no markdown).

Schema:
{
  "ward": number|null,
  "year": number|null,
  "category": string|null,
  "program": string|null,
  "councillor": string|null,
  "keyword": string|null
}

Rules:
- Do NOT invent names. If not sure, use null.
- If the question is about a councillor's voting record, set councillor to the person's name if present.
- keyword should be a short, meaningful phrase only when the user clearly specifies a topic/title; otherwise null.
`

export async function extractEntitiesWithLLM({ message, history = [] }) {
  const provider = getLLMProvider()
  const response = await provider.chat({
    systemPrompt: ENTITY_EXTRACTION_PROMPT,
    context: '',
    message,
    history
  })

  const parsed = safeParseJson(response?.answer)
  return normalizeEntities(parsed)
}
