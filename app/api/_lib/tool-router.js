import { TOOLS } from './tool-definitions'
import { getLLMProvider } from './llm-providers'

const CONFIDENCE_THRESHOLD = 0.6
const MOTION_ID_PATTERN = /\b[A-Z]{1,3}\d+\.\d+\b/i

const TOOL_INDEX = new Map(TOOLS.map((tool) => [tool.name, tool]))

const TOOL_ROUTER_PROMPT = `You are a tool router. Pick the single best tool and parameters to answer the question.
If none of the tools apply, return {"tool": null, "params": {}, "confidence": 0}.

Rules:
- Return JSON only. No markdown or extra text.
- Use only the tool names provided.
- Only use allowed enum values.
- Years must be numbers (e.g., 2024).
- compare_years requires at least 2 years.
- get_motion_details should include motionId if present, otherwise titleContains.
- If the user asks to list/show records or projects (detail listing), do NOT select a tool.
- Only select a tool for computed metrics (count/sum/compare/top/procurement totals) or motion details.
- If the question is descriptive or exploratory, return tool=null.

Tool selection guide:
- count_records: "how many", "count", "number of" for council meetings/motions or lobbyist activity.
- sum_amount: totals or spending amounts (capital or money-flow).
- budget_balance: budget surplus, deficit, or balance questions.
- compare_years: "compare", "difference", "change" across years.
- council_metrics: council pass rate, meeting count, motions passed/failed.
- top_k: "top N", "highest", "biggest" rankings.
- procurement_metrics: procurement totals or concentration.
- get_motion_details: specific motion ID or title.

Dataset hints:
- capital: wards, capital projects, infrastructure.
- money-flow: budget, revenue, expenditure, spending totals (use flowType=expenditure for "spend/spent").
- council: meetings, motions, votes, pass rate.
- lobbyist: registrations, lobbying activity.

Parameter rules:
- count_records: include dataset + recordType (meetings|motions|projects|activities|registrations).
- sum_amount: include dataset; add flowType for money-flow; add groupBy if ward/category requested.
- budget_balance: include year if specified.
- compare_years: include dataset + years (2+); add flowType for money-flow if relevant.
- council_metrics: include metric; include year if specified.
- top_k: include dataset + groupBy + metric; include year if specified.
- procurement_metrics: include year if specified (mode optional).
- get_motion_details: include motionId if present, else titleContains.

Examples (JSON only):
Q: "Show me transit projects in Ward 10"
A: {"tool": null, "params": {}, "confidence": 0}
Q: "What did Toronto spend in 2024?"
A: {"tool": "sum_amount", "params": {"dataset": "money-flow", "flowType": "expenditure", "years": [2024]}, "confidence": 0.9}
Q: "How much did Ward 5 get for parks?"
A: {"tool": "sum_amount", "params": {"dataset": "capital", "filters": {"ward": 5, "category": "parks"}}, "confidence": 0.8}
Q: "What was Toronto's biggest expense in 2024?"
A: {"tool": "top_k", "params": {"dataset": "money-flow", "groupBy": "label", "metric": "spending", "flowType": "expenditure", "year": 2024, "k": 1}, "confidence": 0.8}
Q: "Which ward got the most capital funding?"
A: {"tool": "top_k", "params": {"dataset": "capital", "groupBy": "ward", "metric": "spending", "k": 1}, "confidence": 0.8}
Q: "How much did the city spend on transit?"
A: {"tool": "sum_amount", "params": {"dataset": "money-flow", "flowType": "expenditure", "filters": {"category": "transit"}}, "confidence": 0.8}
Q: "How much was spent on police?"
A: {"tool": "sum_amount", "params": {"dataset": "money-flow", "flowType": "expenditure", "filters": {"category": "police"}}, "confidence": 0.8}
Q: "What was the budget surplus or deficit?"
A: {"tool": "budget_balance", "params": {}, "confidence": 0.8}
Q: "What's the council pass rate?"
A: {"tool": "council_metrics", "params": {"metric": "pass_rate"}, "confidence": 0.8}
Q: "Total capital spending in Ward 10 in 2024"
A: {"tool": "sum_amount", "params": {"dataset": "capital", "years": [2024], "filters": {"ward": 10}}, "confidence": 0.8}

Tool catalog:
`

const buildToolCatalog = () => TOOLS.map((tool) => {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
})

const extractJsonPayload = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return null
  }
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

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const toString = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value).trim()
  return text.length ? text : null
}

const normalizeArray = (value, itemType) => {
  if (!Array.isArray(value)) {
    return null
  }
  if (itemType === 'number') {
    const items = value.map(toNumber).filter((v) => v !== null)
    return items.length ? Array.from(new Set(items)) : null
  }
  if (itemType === 'string') {
    const items = value.map(toString).filter(Boolean)
    return items.length ? Array.from(new Set(items)) : null
  }
  return null
}

const normalizeObject = (value, properties = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const cleaned = {}
  for (const [key, schema] of Object.entries(properties)) {
    const raw = value[key]
    if (raw === undefined || raw === null) {
      continue
    }
    if (schema.type === 'number') {
      const num = toNumber(raw)
      if (num !== null) {
        cleaned[key] = num
      }
    } else if (schema.type === 'string') {
      const text = toString(raw)
      if (text) {
        cleaned[key] = text
      }
    }
  }
  return Object.keys(cleaned).length ? cleaned : null
}

const normalizeParamValue = (raw, schema) => {
  if (!schema || raw === undefined || raw === null) {
    return null
  }

  if (schema.type === 'string') {
    const text = toString(raw)
    if (!text) {
      return null
    }
    if (schema.enum && !schema.enum.includes(text)) {
      return null
    }
    return text
  }

  if (schema.type === 'number') {
    const num = toNumber(raw)
    if (num === null) {
      return null
    }
    return num
  }

  if (schema.type === 'array' && schema.items?.type) {
    return normalizeArray(raw, schema.items.type)
  }

  if (schema.type === 'object') {
    return normalizeObject(raw, schema.properties || {})
  }

  return null
}

const normalizeToolParams = (rawParams, toolDef) => {
  if (!rawParams || typeof rawParams !== 'object') {
    return {}
  }
  const params = {}
  for (const [key, schema] of Object.entries(toolDef.parameters || {})) {
    const normalized = normalizeParamValue(rawParams[key], schema)
    if (normalized !== null && normalized !== undefined) {
      params[key] = normalized
    }
  }

  if (params.k !== undefined) {
    const clamped = Math.max(1, Math.min(20, Math.round(params.k)))
    params.k = clamped
  }

  if (params.windowYears !== undefined) {
    const clamped = Math.max(1, Math.min(10, Math.round(params.windowYears)))
    params.windowYears = clamped
  }

  if (params.motionId && !MOTION_ID_PATTERN.test(params.motionId)) {
    delete params.motionId
  }

  if (params.titleContains) {
    params.titleContains = String(params.titleContains).slice(0, 160)
  }

  return params
}

const validateToolCall = (toolName, params, confidence) => {
  const toolDef = TOOL_INDEX.get(toolName)
  if (!toolDef) {
    return null
  }

  const cleanedParams = normalizeToolParams(params, toolDef)

  if (toolName === 'compare_years') {
    if (!Array.isArray(cleanedParams.years) || cleanedParams.years.length < 2) {
      return null
    }
  }

  if (['count_records', 'sum_amount', 'compare_years', 'top_k'].includes(toolName)) {
    if (!cleanedParams.dataset) {
      return null
    }
  }

  if (toolName === 'get_motion_details') {
    if (!cleanedParams.motionId && !cleanedParams.titleContains) {
      return null
    }
  }

  return {
    tool: toolName,
    params: cleanedParams,
    confidence
  }
}

export const routeToolWithLLM = async (message) => {
  try {
    const provider = getLLMProvider()
    const toolCatalog = buildToolCatalog()

    const response = await provider.chat({
      systemPrompt: TOOL_ROUTER_PROMPT + JSON.stringify(toolCatalog, null, 2),
      context: '',
      message
    })

    const payload = extractJsonPayload(response.answer)
    if (!payload) {
      return null
    }

    let parsed
    try {
      parsed = JSON.parse(payload)
    } catch (error) {
      return null
    }

    const toolName = parsed?.tool ? String(parsed.tool).trim() : null
    if (!toolName || toolName.toLowerCase() === 'none' || toolName.toLowerCase() === 'null') {
      return null
    }

    const confidence = toNumber(parsed.confidence) ?? 0
    if (confidence < CONFIDENCE_THRESHOLD) {
      return null
    }

    return validateToolCall(toolName, parsed.params || {}, confidence)
  } catch (error) {
    console.warn('LLM tool router failed:', error.message)
    return null
  }
}
