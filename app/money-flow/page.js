'use client'

import { useCallback, useState } from 'react'
import MoneyFlowSection from '../components/sections/MoneyFlowSection'
import { useApiData } from '../utils/hooks/useApiData'

const DEFAULT_YEAR = 2024

export default function MoneyFlowPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from(
    new Set([DEFAULT_YEAR, currentYear, currentYear - 1, currentYear - 2])
  ).sort((a, b) => b - a)

  const moneyFlowTransform = useCallback(({ ok, data }) => {
    if (!ok || data?.error) {
      return {
        error: data?.error || 'Money flow data unavailable',
        meta: data?.sourceStatus || null
      }
    }
    return { data }
  }, [])

  const budgetTransform = useCallback(({ ok, data }) => {
    if (!ok || data?.error) {
      return { error: data?.error || 'Budget vs actual data unavailable' }
    }
    return { data }
  }, [])

  const {
    data: moneyFlow,
    loading: moneyFlowLoading,
    error: moneyFlowError,
    meta: moneyFlowStatus
  } = useApiData('/api/money-flow', { year }, { transform: moneyFlowTransform })

  const { data: budgetActual } = useApiData(
    '/api/budget-vs-actual',
    { year },
    { transform: budgetTransform }
  )

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#111827', fontWeight: 700 }}>
          Money Flow
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          Where Toronto’s money comes from and where it goes.
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

      <MoneyFlowSection
        year={year}
        moneyFlow={moneyFlow}
        loading={moneyFlowLoading}
        error={moneyFlowError}
        status={moneyFlowStatus}
        budgetActual={budgetActual}
      />
    </div>
  )
}
