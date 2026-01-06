const fs = require('fs')
const path = require('path')

const checks = [
  {
    path: 'data/processed/financial_return.json',
    type: 'array',
    requiredKeys: ['fiscal_year', 'amount', 'flow_type']
  },
  {
    path: 'data/processed/capital_by_ward.json',
    type: 'array',
    requiredKeys: ['ward_number', 'amount', 'fiscal_year']
  },
  {
    path: 'data/processed/council_voting.json',
    type: 'array',
    requiredKeys: ['meeting_date', 'motion_id']
  },
  {
    path: 'data/processed/lobbyist_activity.json',
    type: 'array',
    requiredKeys: ['lobbyist_name', 'registration_date']
  },
  {
    path: 'data/processed/operating_budget.json',
    type: 'array',
    requiredKeys: ['fiscal_year', 'amount', 'expense_revenue']
  },
  {
    path: 'data/processed/ward_boundaries.geojson',
    type: 'object',
    requiredKeys: ['type', 'features']
  }
]

const readJson = (relativePath) => {
  const fullPath = path.join(process.cwd(), relativePath)
  const raw = fs.readFileSync(fullPath, 'utf-8')
  return JSON.parse(raw)
}

const ensureArray = (data, label) => {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${label} is empty or not an array`)
  }
}

const ensureObject = (data, label) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} is not an object`)
  }
}

const ensureKeys = (sample, keys, label) => {
  const missing = keys.filter((key) => !(key in sample))
  if (missing.length) {
    throw new Error(`${label} missing keys: ${missing.join(', ')}`)
  }
}

let failures = 0

for (const check of checks) {
  const label = check.path
  try {
    const data = readJson(check.path)
    if (check.type === 'array') {
      ensureArray(data, label)
      const sample = data.find((item) => item && typeof item === 'object') || {}
      ensureKeys(sample, check.requiredKeys, label)
    } else {
      ensureObject(data, label)
      ensureKeys(data, check.requiredKeys, label)
      if (check.path.endsWith('.geojson') && !Array.isArray(data.features)) {
        throw new Error(`${label} features is not an array`)
      }
    }
    console.log(`OK: ${label}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL: ${label} -> ${error.message}`)
  }
}

if (failures > 0) {
  process.exitCode = 1
  console.error(`Smoke test failed (${failures} checks).`)
} else {
  console.log('Smoke test passed.')
}
