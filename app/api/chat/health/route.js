import { NextResponse } from 'next/server'
import {
  getCapitalIndexUrl,
  getCouncilSummaryUrl,
  getCouncilTrendsUrl,
  getMoneyFlowIndexUrl,
  getRagIndexUrl
} from '../../_lib/gcs-urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fetchCheck = async (label, url) => {
  const start = Date.now()
  try {
    const response = await fetch(url, { cache: 'no-store' })
    return {
      label,
      url,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - start
    }
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      error: error.message,
      ms: Date.now() - start
    }
  }
}

const getProviderStatus = () => {
  const provider = process.env.LLM_PROVIDER || 'anthropic'
  const keyPresent = provider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY)

  return {
    provider,
    configured: keyPresent
  }
}

const getLoggingStatus = () => {
  const enabled = process.env.CHAT_ENABLE_LOGGING === 'true'
  const logDir = process.env.CHAT_LOG_DIR || (
    process.env.NODE_ENV === 'production'
      ? '/tmp/standardize-journalism-logs'
      : 'data/logs'
  )

  return {
    enabled,
    logDir
  }
}

export async function GET() {
  const checks = await Promise.all([
    fetchCheck('money-flow-index', getMoneyFlowIndexUrl()),
    fetchCheck('capital-index', getCapitalIndexUrl()),
    fetchCheck('council-summary', getCouncilSummaryUrl()),
    fetchCheck('council-trends', getCouncilTrendsUrl()),
    fetchCheck('rag-index', getRagIndexUrl())
  ])

  const providerStatus = getProviderStatus()
  const loggingStatus = getLoggingStatus()
  const dataReady = checks.every(check => check.ok)
  const ready = dataReady && providerStatus.configured

  return NextResponse.json({
    ready,
    dataReady,
    provider: providerStatus,
    logging: loggingStatus,
    checks,
    timestamp: new Date().toISOString()
  })
}
