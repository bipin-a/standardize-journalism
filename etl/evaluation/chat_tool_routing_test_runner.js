#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const BASE_URL = process.env.CHAT_BASE_URL || 'http://localhost:3000'
const TEST_FILE = process.env.TEST_QUERIES_PATH || path.join(__dirname, 'test_queries.json')
const SHOW_ALL = process.env.SHOW_ALL === 'true'

const loadTests = () => {
  const raw = fs.readFileSync(TEST_FILE, 'utf-8')
  return JSON.parse(raw)
}

const requestChat = async (query) => {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: query, conversationId: 'test-runner' })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return response.json()
}

const assertEqual = (label, actual, expected, failures) => {
  if (expected === undefined) {
    return
  }
  if (actual !== expected) {
    failures.push(`${label} expected ${expected} but got ${actual}`)
  }
}

const runTest = async (test, index) => {
  const failures = []
  const response = await requestChat(test.query)
  const metadata = response.metadata || {}
  const envelope = response.response || {}

  assertEqual('retrievalType', metadata.retrievalType, test.expectedRetrieval, failures)
  assertEqual('tool', metadata.tool, test.expectedTool, failures)
  assertEqual('responseType', envelope.responseType, test.expectedResponseType, failures)
  assertEqual('toolDataset', metadata.toolDataset, test.expectedToolDataset, failures)
  assertEqual('ragStrategy', metadata.ragStrategy, test.expectedRagStrategy, failures)
  assertEqual('toolRouting', metadata.toolRouting, test.expectedToolRouting, failures)
  if (test.expectedFailureReason !== undefined) {
    assertEqual('failureReason', metadata.failureReason, test.expectedFailureReason, failures)
  } else if (metadata.failureReason) {
    failures.push(`failureReason present: ${metadata.failureReason}`)
  }

  return {
    index,
    query: test.query,
    failures,
    answer: response.answer,
    summary: envelope.summary,
    ragStrategy: metadata.ragStrategy,
    toolRouting: metadata.toolRouting,
    toolRoutingConfidence: metadata.toolRoutingConfidence,
    failureReason: metadata.failureReason,
    failureDetail: metadata.failureDetail
  }
}

const main = async () => {
  const tests = loadTests()
  const results = []

  for (let i = 0; i < tests.length; i += 1) {
    const test = tests[i]
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await runTest(test, i)
      results.push(result)
    } catch (error) {
      results.push({
        index: i,
        query: test.query,
        failures: [`request failed: ${error.message}`]
      })
    }
  }

  const failures = results.filter((result) => result.failures.length > 0)

  if (failures.length === 0) {
    console.log(`All ${results.length} tests passed.`)
  } else {
    console.log(`${failures.length} of ${results.length} tests failed:`)
  }

  for (const result of results) {
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL'
    console.log(`- [${result.index}] ${status} ${result.query}`)
    if (result.failures.length) {
      for (const detail of result.failures) {
        console.log(`  - ${detail}`)
      }
    }
    console.log(`  answer: ${result.answer || ''}`)
    if (result.summary) {
      console.log(`  summary: ${result.summary}`)
    }
    if (result.ragStrategy) {
      console.log(`  ragStrategy: ${result.ragStrategy}`)
    }
    if (result.toolRouting) {
      console.log(`  toolRouting: ${result.toolRouting}`)
    }
    if (result.toolRoutingConfidence !== undefined) {
      console.log(`  toolRoutingConfidence: ${result.toolRoutingConfidence}`)
    }
    if (result.failureReason) {
      console.log(`  failureReason: ${result.failureReason}`)
    }
    if (result.failureDetail) {
      const detail = typeof result.failureDetail === 'string'
        ? result.failureDetail
        : JSON.stringify(result.failureDetail)
      console.log(`  failureDetail: ${detail}`)
    }
  }

  if (failures.length === 0) {
    process.exit(0)
  }
  process.exit(1)
}

main().catch((error) => {
  console.error('Test runner failed:', error)
  process.exit(1)
})
