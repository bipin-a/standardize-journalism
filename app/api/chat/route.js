// Chat API Route - Data-Bounded Chatbot for Toronto Money Flow
// Server-side only - API keys never exposed to client

import { NextResponse } from 'next/server'
import { appendFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checkRateLimit } from '../_lib/rate-limiter'
import { buildContext } from '../_lib/context-builder'
import { getLLMProvider } from '../_lib/llm-providers'
import { buildNarrativeEnvelope, buildToolEnvelope } from '../_lib/response-builder'

// Force server-side execution (no edge runtime)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // No caching for chat

// System prompt that enforces data boundaries
const SYSTEM_PROMPT_OVERVIEW = `You are a helpful assistant for the Toronto Money Flow dashboard. Your role is to answer questions ONLY using the provided data summaries.

STRICT RULES:
1. ONLY answer questions that can be answered from the provided data
2. If the data doesn't contain the answer, politely say: "I don't have that information in the available data. I can only answer questions about Toronto's budget, capital spending, and council decisions for the years I have data for."
3. Keep answers concise (2-3 sentences maximum)
4. Always mention which data source you used (money flow, capital projects, or council decisions)
5. If asked about a specific year and that year is not in the data, say: "I only have data for [list available years]"
6. Format currency values as CAD with billions (B) or millions (M) notation
7. Do not speculate or make assumptions beyond the provided data
8. Do not answer questions unrelated to Toronto municipal government

AUDIENCE:
You are answering questions for teenagers learning about municipal government. Use clear, simple language without jargon. Be friendly and encouraging.

EXAMPLES:
Good: "Toronto spent $15.2B in 2024, with the biggest expense being..."
Bad: "I think Toronto probably spent around..."

Good: "According to the capital projects data, Ward 10 received $71M..."
Bad: "Ward 10 usually gets a lot of funding..."
`

const SYSTEM_PROMPT_DETAIL = `You are a helpful assistant for the Toronto Money Flow dashboard. You are answering DETAILED questions based on filtered municipal records.

STRICT RULES:
1. Summarize the results - do not list all records verbatim
2. Highlight the top 3-5 items by size or relevance
3. Include totals and counts when possible
4. If the filtered results are empty, say: "I don't have matching records for that request."
5. Always mention which dataset and year you used (call out if it’s the most recent year with matches)
6. Format currency values as CAD with billions (B) or millions (M)
7. Keep answers concise (2-4 sentences)

AUDIENCE:
Use clear, teen-friendly language without jargon.
`

/**
 * POST /api/chat
 * Main chat endpoint
 */
export async function POST(request) {
  const startTime = Date.now()

  try {
    // 1. Parse and validate request
    const body = await request.json()
    const { message, conversationId } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({
        error: 'Invalid request: message is required'
      }, { status: 400 })
    }

    if (message.trim().length === 0) {
      return NextResponse.json({
        error: 'Message cannot be empty'
      }, { status: 400 })
    }

    if (message.length > 500) {
      return NextResponse.json({
        error: 'Message is too long. Please keep questions under 500 characters.'
      }, { status: 400 })
    }

    // 2. Rate limiting (20 messages/minute)
    const clientId = getClientIdentifier(request)
    const rateLimitResult = checkRateLimit(clientId)

    if (!rateLimitResult.allowed) {
      return NextResponse.json({
        error: `You're asking questions too quickly! Please wait ${rateLimitResult.retryAfter} seconds before trying again.`,
        type: 'RATE_LIMIT',
        retryAfter: rateLimitResult.retryAfter
      }, { status: 429 })
    }

    // 3. Build context from gold summaries
    const context = await buildContext(message)

    if (context?.retrievalType === 'tool' && context.toolResult) {
      const envelope = buildToolEnvelope(context.toolResult)
      const result = {
        answer: envelope?.summary || 'Tool response ready.',
        response: envelope,
        sources: envelope?.sources || [],
        metadata: {
          year: context.toolResult.year || context.toolResult.years?.[0] || null,
          dataTypes: context.toolResult.dataset ? [context.toolResult.dataset] : [],
          processingTime: Date.now() - startTime,
          retrievalType: 'tool',
          tool: context.toolResult.tool,
          toolDataset: context.toolResult.dataset,
          toolSource: context.toolResult.source,
          toolRouting: context.toolRouting || 'llm',
          toolRoutingConfidence: context.toolRoutingConfidence,
          dataTimestamp: context.toolResult.dataTimestamp,
          responseType: envelope?.responseType,
          completeness: envelope?.completeness,
          failureReason: context.toolResult.failureReason,
          failureDetail: context.toolResult.failureDetail
        }
      }

      if (result.metadata.failureReason) {
        console.warn('[chat failure]', JSON.stringify({
          query: message,
          conversationId,
          retrievalType: 'tool',
          tool: result.metadata.tool,
          toolDataset: result.metadata.toolDataset,
          failureReason: result.metadata.failureReason,
          failureDetail: result.metadata.failureDetail
        }))
      }

      if (process.env.CHAT_ENABLE_LOGGING === 'true') {
        await logChatInteraction({
          message,
          answer: result.answer,
          sources: result.sources,
          conversationId,
          clientId,
          processingTime: result.metadata.processingTime,
          retrievalType: result.metadata.retrievalType,
          tool: result.metadata.tool,
          toolDataset: result.metadata.toolDataset,
          toolRoutingConfidence: result.metadata.toolRoutingConfidence
        }).catch(err => {
          console.error('Failed to log chat interaction:', err)
        })
      }

      return NextResponse.json(result)
    }

    if (!context?.data || context.data.trim().length === 0) {
      const ragStrategy = context?.ragStrategy || 'embeddings'
      const failureReason = context?.failureReason || 'no_rag_hits'
      const failureDetail = context?.failureDetail || null
      const answer = failureReason === 'no_filtered_records'
        ? "I don't have matching records for that request."
        : "I couldn't find any relevant data to answer your question. If this should be answerable, the RAG index may need improvement. I can help with questions about Toronto's budget, capital projects, and council decisions."
      const envelope = buildNarrativeEnvelope({
        summary: answer,
        sources: context?.sources || [],
        ragStrategy,
        dataTypes: context?.dataTypes || [],
        year: context?.year || null
      })

      const result = {
        answer,
        response: envelope,
        sources: envelope.sources,
        metadata: {
          year: context?.year || null,
          requestedYear: context?.requestedYear ?? null,
          actualYear: context?.actualYear ?? context?.year ?? null,
          fellBack: context?.fellBack ?? false,
          latestYearChecked: context?.latestYearChecked ?? null,
          dataTypes: context?.dataTypes || [],
          processingTime: Date.now() - startTime,
          retrievalType: 'rag',
          ragStrategy,
          resultsCount: context?.resultsCount,
          responseType: envelope.responseType,
          completeness: envelope.completeness,
          failureReason,
          failureDetail
        }
      }

      if (result.metadata.failureReason) {
        console.warn('[chat failure]', JSON.stringify({
          query: message,
          conversationId,
          retrievalType: 'rag',
          ragStrategy: result.metadata.ragStrategy,
          failureReason: result.metadata.failureReason,
          failureDetail: result.metadata.failureDetail
        }))
      }

      if (process.env.CHAT_ENABLE_LOGGING === 'true') {
        await logChatInteraction({
          message,
          answer: result.answer,
          sources: result.sources,
          conversationId,
          clientId,
          processingTime: result.metadata.processingTime,
          retrievalType: result.metadata.retrievalType,
          ragStrategy: result.metadata.ragStrategy,
          resultsCount: result.metadata.resultsCount,
          retrievalScores: [],
          failureReason: result.metadata.failureReason,
          failureDetail: result.metadata.failureDetail
        }).catch(err => {
          console.error('Failed to log chat interaction:', err)
        })
      }

      return NextResponse.json(result)
    }

    // 4. Get LLM provider and generate response
    let provider
    try {
      provider = getLLMProvider()
    } catch (providerError) {
      console.error('LLM provider initialization error:', providerError)
      return NextResponse.json({
        error: 'Chat service is temporarily unavailable. Please try again later.',
        type: 'CONFIG_ERROR'
      }, { status: 503 })
    }

    const systemPrompt = context.ragStrategy === 'filters'
      ? SYSTEM_PROMPT_DETAIL
      : SYSTEM_PROMPT_OVERVIEW

    const response = await provider.chat({
      systemPrompt,
      context: context.data,
      message
    })

    const envelope = buildNarrativeEnvelope({
      summary: response.answer,
      sources: context.sources,
      ragStrategy: context.ragStrategy,
      dataTypes: context.dataTypes,
      year: context.year
    })

    // 5. Prepare response
    const result = {
      answer: response.answer,
      response: envelope,
      sources: envelope.sources,
      metadata: {
        year: context.year,
        requestedYear: context?.requestedYear ?? null,
        actualYear: context?.actualYear ?? context?.year ?? null,
        fellBack: context?.fellBack ?? false,
        latestYearChecked: context?.latestYearChecked ?? null,
        dataTypes: context.dataTypes,
        model: provider.modelName,
        processingTime: Date.now() - startTime,
        usage: response.usage,
        retrievalType: 'rag',
        ragStrategy: context.ragStrategy,
        resultsCount: context.resultsCount,
        retrievalScores: context.scores,
        responseType: envelope.responseType,
        completeness: envelope.completeness
      }
    }

    // 6. Optional logging (if enabled)
    if (process.env.CHAT_ENABLE_LOGGING === 'true') {
      await logChatInteraction({
        message,
        answer: response.answer,
        sources: context.sources,
        conversationId,
        clientId,
        processingTime: result.metadata.processingTime,
        retrievalType: result.metadata.retrievalType,
        ragStrategy: result.metadata.ragStrategy,
        resultsCount: context.resultsCount,
        retrievalScores: context.scores
      }).catch(err => {
        // Don't fail the request if logging fails
        console.error('Failed to log chat interaction:', err)
      })
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Chat API error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })

    // Handle specific error types
    if (error.message.includes('API key')) {
      return NextResponse.json({
        error: 'Chat service is not configured properly. Please contact support.',
        type: 'CONFIG_ERROR'
      }, { status: 503 })
    }

    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return NextResponse.json({
        error: 'The request took too long. Please try a simpler question.',
        type: 'TIMEOUT'
      }, { status: 504 })
    }

    // Generic error
    return NextResponse.json({
      error: 'Something went wrong processing your question. Please try again.',
      type: 'UNKNOWN'
    }, { status: 500 })
  }
}

/**
 * Get unique client identifier for rate limiting
 * Uses IP address + User-Agent hash
 */
function getClientIdentifier(request) {
  const ip = request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown'

  const userAgent = request.headers.get('user-agent') || ''

  // Combine IP and first 50 chars of user-agent
  return `${ip}:${userAgent.slice(0, 50)}`
}

/**
 * Log chat interaction to JSONL file for analysis
 * Format: One JSON object per line (append-only)
 */
async function logChatInteraction(data) {
  try {
    const logsDir = process.env.CHAT_LOG_DIR || (
      process.env.NODE_ENV === 'production'
        ? join(tmpdir(), 'standardize-journalism-logs')
        : join(process.cwd(), 'data/logs')
    )
    const logFile = join(logsDir, 'chat_history.jsonl')

    // Create logs directory if it doesn't exist
    if (!existsSync(logsDir)) {
      await mkdir(logsDir, { recursive: true })
    }

    // Prepare log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: data.message,
        answer: data.answer,
        sources: data.sources,
        conversationId: data.conversationId,
        clientId: data.clientId.split(':')[0], // Only log IP, not full user-agent for privacy
        processingTime: data.processingTime,
        retrievalType: data.retrievalType,
        ragStrategy: data.ragStrategy,
        tool: data.tool,
        toolDataset: data.toolDataset,
        toolRoutingConfidence: data.toolRoutingConfidence,
        resultsCount: data.resultsCount,
        retrievalScores: data.retrievalScores,
        failureReason: data.failureReason,
        failureDetail: data.failureDetail
      }

    // Append to JSONL file
    await appendFile(logFile, JSON.stringify(logEntry) + '\n')
  } catch (error) {
    console.error('Failed to write chat log:', error)
    throw error
  }
}
