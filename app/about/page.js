'use client'

import { useCallback, useState } from 'react'
import CITY_BUDGET_GLOSSARY from '../data/city_budget_glossary.json'
import { formatCount } from '../utils/formatters'
import { useApiData } from '../utils/hooks/useApiData'

const DEFAULT_YEAR = 2024

export default function AboutPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from(
    new Set([DEFAULT_YEAR, currentYear, currentYear - 1, currentYear - 2])
  ).sort((a, b) => b - a)

  const metricTransform = useCallback(({ ok, data }) => {
    if (!ok || data?.error) {
      return { error: data?.error || 'Contract data unavailable' }
    }
    return { data }
  }, [])

  const { data: metric } = useApiData('/api/metric', { year }, { transform: metricTransform })

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#111827', fontWeight: 700 }}>
          About & Sources
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          Methodology, limitations, and source datasets.
        </p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: '#6b7280', marginRight: '8px', fontWeight: 600 }}>
          Year
        </label>
        <select
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          {yearOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '32px 0', borderBottom: '1px solid #e5e7eb' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#6b7280',
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          Section 7: What You Should Know
        </div>

        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
          Important Limitations
        </div>
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fde68a',
            marginBottom: '24px'
          }}
        >
          <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Contract records expire:</strong> Data is only available for ~18 months. Historical totals are incomplete.
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Awarded ≠ Actually Paid:</strong> These are contract amounts, not what the city actually spent or invoiced.
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>When to worry about concentration:</strong> If the top vendor gets more than 20% or top 10 get more than 60%, there may be limited competition.
            </div>
            <div>
              <strong>Non-competitive is sometimes OK:</strong> Direct awards without bidding. High percentages (over 30%) may need review, but emergencies and sole-source suppliers are legitimate.
            </div>
          </div>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
          Where This Data Comes From
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', marginBottom: '16px' }}>
          All data comes from Toronto Open Data, the city's official open data portal:
        </div>
        <div style={{ fontSize: '13px', lineHeight: '1.8', marginBottom: '24px' }}>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/tobids-awarded-contracts/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Competitive Contracts
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (updated regularly)
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/tobids-non-competitive-contracts/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Non-Competitive Contracts
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (updated regularly)
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/budget-capital-budget-plan-by-ward-10-yr-approved/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Capital Budget by Ward
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (10-year plan)
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/budget-operating-budget-program-summary-by-expenditure-category/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Operating Budget Program Summary
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (planned totals)
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/revenues-and-expenses/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Financial Information Return (Revenues & Expenses)
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (annual summary)
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/city-council-voting-record/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Council Voting Record
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (updated after meeting minutes published, typically weekly or less frequent)
            </span>
          </div>
          <div>
            →{' '}
            <a
              href="https://open.toronto.ca/dataset/lobbyist-registry/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Lobbyist Registry
            </a>
            <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
              (updated daily)
            </span>
          </div>
        </div>

        {metric && (
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              fontSize: '12px',
              color: '#6b7280'
            }}
          >
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ color: '#111827' }}>Records analyzed:</strong>{' '}
              {formatCount(metric.competitive.recordsUsed)} competitive contracts,{' '}
              {formatCount(metric.nonCompetitive.recordsUsed)} non-competitive contracts
            </div>
            <div>
              <strong style={{ color: '#111827' }}>Last updated:</strong>{' '}
              {new Date(metric.timestamp).toLocaleString('en-CA')}
            </div>
          </div>
        )}
      </div>

      <div id="city-budget-glossary" style={{ paddingTop: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
          City Budget Glossary
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
          Definitions and context for common budget terms in the revenue and spending lists.
        </div>
        <div>
          {CITY_BUDGET_GLOSSARY.map(entry => (
            <div key={entry.id} id={`glossary-${entry.id}`} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                {entry.term}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
                {entry.definition}
              </div>
              {entry.details && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#4b5563', lineHeight: '1.6' }}>
                  {entry.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
