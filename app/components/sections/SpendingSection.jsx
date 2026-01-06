'use client'

import { formatCompactCurrency, formatCount } from '../../utils/formatters'

const SpendingSection = ({ year, metric, loading, error }) => {
  if (loading) {
    return (
      <div style={{ padding: '32px 20px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
        Loading spending breakdown...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
        Spending breakdown unavailable: {error}
      </div>
    )
  }

  if (!metric) {
    return null
  }

  return (
    <div style={{ padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          Section 3: What Are We Buying?
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          Year: {year}
        </div>
      </div>

      <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
        By City Department
      </div>
      {metric.competitive.divisionBreakdown.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
          No division data available for this year.
        </div>
      ) : (
        <div>
          {metric.competitive.divisionBreakdown.map((division, idx) => {
            const maxValue = metric.competitive.divisionBreakdown[0].totalValue
            const widthPercent = (division.totalValue / maxValue) * 100

            return (
              <div key={division.name} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                  <span style={{ fontWeight: 500, color: '#111827' }}>
                    {division.name}
                  </span>
                  <span style={{ fontWeight: 600, color: '#3b82f6', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                    {formatCompactCurrency(division.totalValue)}
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${widthPercent}%`,
                      height: '100%',
                      backgroundColor: idx === 0 ? '#3b82f6' : '#93c5fd',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '24px', fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
        By Type of Purchase
      </div>
      {metric.competitive.categoryBreakdown.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
          No category data available for this year.
        </div>
      ) : (
        <div>
          {metric.competitive.categoryBreakdown.map((category, idx) => {
            const maxValue = metric.competitive.categoryBreakdown[0].totalValue
            const widthPercent = (category.totalValue / maxValue) * 100

            return (
              <div key={category.name} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                  <span style={{ fontWeight: 500, color: '#111827' }}>
                    {category.name}
                  </span>
                  <span style={{ fontWeight: 600, color: '#3b82f6', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                    {formatCompactCurrency(category.totalValue)}
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${widthPercent}%`,
                      height: '100%',
                      backgroundColor: idx === 0 ? '#3b82f6' : '#93c5fd',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          marginTop: '24px',
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
    </div>
  )
}

export default SpendingSection
