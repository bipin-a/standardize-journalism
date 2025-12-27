'use client'

import { useState, useEffect } from 'react'

const DEFAULT_YEAR = 2024
const COMPACT_FORMATTER = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  notation: 'compact',
  maximumFractionDigits: 1
})
const FULL_FORMATTER = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0
})

const formatCompactCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return COMPACT_FORMATTER.format(value)
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return FULL_FORMATTER.format(value)
}

const formatCount = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return Number(value).toLocaleString('en-CA')
}

const formatPercent = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return `${value.toFixed(1)}%`
}

const getHealthColor = (value, threshold, reverse = false) => {
  if (value === null || value === undefined) return '#94a3b8'
  const isWarning = reverse ? value < threshold : value > threshold
  return isWarning ? '#dc2626' : '#16a34a'
}

const getCategoryLabel = (category) => {
  const labels = {
    transportation: 'Transit & Transportation',
    housing_development: 'Housing & Development',
    environment: 'Environment & Climate',
    budget_finance: 'Budget & Taxes',
    public_safety: 'Police & Safety',
    social_services: 'Community Services',
    governance: 'Council Operations',
    other: 'Other'
  }
  return labels[category] || category
}

export default function Home() {
  const [metric, setMetric] = useState(null)
  const [capitalData, setCapitalData] = useState(null)
  const [wardMapData, setWardMapData] = useState(null)
  const [moneyFlow, setMoneyFlow] = useState(null)
  const [councilData, setCouncilData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [capitalLoading, setCapitalLoading] = useState(true)
  const [wardMapLoading, setWardMapLoading] = useState(true)
  const [moneyFlowLoading, setMoneyFlowLoading] = useState(true)
  const [councilLoading, setCouncilLoading] = useState(true)
  const [error, setError] = useState(null)
  const [capitalError, setCapitalError] = useState(null)
  const [wardMapError, setWardMapError] = useState(null)
  const [moneyFlowError, setMoneyFlowError] = useState(null)
  const [councilError, setCouncilError] = useState(null)
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [showCapitalDetails, setShowCapitalDetails] = useState(false)
  const [showVotingDetails, setShowVotingDetails] = useState(false)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from(
    new Set([DEFAULT_YEAR, currentYear, currentYear - 1, currentYear - 2])
  ).sort((a, b) => b - a)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setMetric(null)
    fetch(`/api/metric?year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setMetric(data)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [year])

  useEffect(() => {
    setCapitalLoading(true)
    setCapitalError(null)
    setCapitalData(null)
    fetch(`/api/capital-by-ward?year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setCapitalError(data.error)
        } else {
          setCapitalData(data)
        }
        setCapitalLoading(false)
      })
      .catch(err => {
        setCapitalError(err.message)
        setCapitalLoading(false)
      })
  }, [year])

  useEffect(() => {
    setWardMapLoading(true)
    setWardMapError(null)
    setWardMapData(null)
    fetch(`/api/ward-map?year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setWardMapError(data.error)
        } else {
          setWardMapData(data)
        }
        setWardMapLoading(false)
      })
      .catch(err => {
        setWardMapError(err.message)
        setWardMapLoading(false)
      })
  }, [year])

  useEffect(() => {
    setMoneyFlowLoading(true)
    setMoneyFlowError(null)
    setMoneyFlow(null)
    fetch(`/api/money-flow?year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setMoneyFlowError(data.error)
        } else {
          setMoneyFlow(data)
        }
        setMoneyFlowLoading(false)
      })
      .catch(err => {
        setMoneyFlowError(err.message)
        setMoneyFlowLoading(false)
      })
  }, [year])

  useEffect(() => {
    setCouncilLoading(true)
    setCouncilError(null)
    setCouncilData(null)
    fetch(`/api/council-decisions?year=${year}&recent=365`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setCouncilError(data.error)
        } else {
          setCouncilData(data)
        }
        setCouncilLoading(false)
      })
      .catch(err => {
        setCouncilError(err.message)
        setCouncilLoading(false)
      })
  }, [year])

  const renderGroupList = (groups, color) => {
    if (!groups || groups.length === 0) {
      return (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          No items available.
        </div>
      )
    }

    return groups.map(group => {
      const widthPercent = Math.max(2, group.percentage || 0)

      return (
        <div key={group.label} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
            <span style={{ fontWeight: 500, color: '#111827' }}>
              {group.label}
            </span>
            <span style={{ fontWeight: 600, color, marginLeft: '8px', whiteSpace: 'nowrap' }}>
              {formatCompactCurrency(group.amount)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${widthPercent}%`,
                  height: '100%',
                  backgroundColor: color,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
            <span style={{ fontSize: '11px', color: '#6b7280', width: '48px', textAlign: 'right' }}>
              {formatPercent(group.percentage)}
            </span>
          </div>
        </div>
      )
    })
  }

  return (
    <div
      style={{
        backgroundColor: '#fafafa',
        minHeight: '100vh',
        padding: '0'
      }}
    >
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          backgroundColor: 'white'
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h1
            style={{
              margin: '0 0 8px 0',
              fontSize: '28px',
              color: '#111827',
              fontWeight: 700
            }}
          >
            Toronto Money Flow
          </h1>
          <p
            style={{
              margin: '0 0 16px 0',
              color: '#6b7280',
              fontSize: '15px'
            }}
          >
            Where does the city's money go?
          </p>

          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', marginRight: '8px', fontWeight: 500 }}>
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
        </div>

        {loading && (
          <div style={{ padding: '40px 20px', color: '#6b7280', fontSize: '16px', textAlign: 'center' }}>
            Loading from Toronto Open Data...
          </div>
        )}

        {error && (
          <div style={{ padding: '40px 20px', color: '#dc2626', fontSize: '16px', textAlign: 'center' }}>
            Error: {error}
          </div>
        )}

        {moneyFlowLoading && (
          <div style={{ padding: '32px 20px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
            Loading money flow data...
          </div>
        )}

        {moneyFlowError && (
          <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
            Money flow data unavailable: {moneyFlowError}
          </div>
        )}

        {moneyFlow && (
          <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Section 0: Money In / Money Out
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '20px',
                marginTop: '16px'
              }}
            >
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                  Money Coming In
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981', marginTop: '8px' }}>
                  {formatCompactCurrency(moneyFlow.revenue.total)}
                </div>

                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Biggest 7 Sources
                  </div>
                  {renderGroupList(moneyFlow.revenue.topGroups, '#10b981')}
                </div>

                {moneyFlow.revenue.bottomGroups.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Smallest 7 Sources
                    </div>
                    {renderGroupList(moneyFlow.revenue.bottomGroups, '#86efac')}
                  </div>
                )}
              </div>

              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                  Money Going Out
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6', marginTop: '8px' }}>
                  {formatCompactCurrency(moneyFlow.expenditure.total)}
                </div>

                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Biggest 7 Costs
                  </div>
                  {renderGroupList(moneyFlow.expenditure.topGroups, '#3b82f6')}
                </div>

                {moneyFlow.expenditure.bottomGroups.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Smallest 7 Costs
                    </div>
                    {renderGroupList(moneyFlow.expenditure.bottomGroups, '#93c5fd')}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: moneyFlow.balance.isSurplus ? '#ecfdf3' : '#fef2f2',
                border: `1px solid ${moneyFlow.balance.isSurplus ? '#a7f3d0' : '#fecaca'}`,
                color: moneyFlow.balance.isSurplus ? '#065f46' : '#991b1b',
                fontSize: '13px'
              }}
            >
              <strong>{moneyFlow.balance.isSurplus ? 'Surplus' : 'Deficit'}:</strong>{' '}
              {formatCompactCurrency(moneyFlow.balance.amount)} ({formatPercent(Math.abs(moneyFlow.balance.percentageOfRevenue))} of revenue)
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
              Totals use positive line items only. Adjustments are excluded.
            </div>
          </div>
        )}

        {metric && (
          <>
            {/* Section 1: City Spending on Contracts */}
            <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6b7280',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                Section 1: City Spending on Contracts
              </div>
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: '#111827',
                  lineHeight: 1,
                  marginTop: '12px'
                }}
              >
                {formatCompactCurrency(metric.competitive.totalValue)}
              </div>
              <div
                style={{
                  fontSize: '15px',
                  color: '#6b7280',
                  marginTop: '12px'
                }}
              >
                across <strong>{formatCount(metric.competitive.contractCount)}</strong> contracts awarded competitively
              </div>

              {/* Stacked bar visualization */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', marginBottom: '12px' }}>
                  Competitive vs Non-Competitive Split
                </div>
                <div style={{ position: 'relative', height: '32px', backgroundColor: '#e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${(metric.competitive.totalValue / (metric.competitive.totalValue + metric.nonCompetitive.totalValue)) * 100}%`,
                      backgroundColor: '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: '12px',
                      transition: 'width 0.3s ease'
                    }}
                  >
                    {metric.competitive.totalValue / (metric.competitive.totalValue + metric.nonCompetitive.totalValue) > 0.15 && (
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>
                        Competitive: {formatPercent((metric.competitive.totalValue / (metric.competitive.totalValue + metric.nonCompetitive.totalValue)) * 100)}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      height: '100%',
                      width: `${metric.nonCompetitive.amountShare}%`,
                      backgroundColor: '#f59e0b',
                      display: 'flex',
                      alignItems: 'center',
                      paddingRight: '12px',
                      justifyContent: 'flex-end',
                      transition: 'width 0.3s ease'
                    }}
                  >
                    {metric.nonCompetitive.amountShare > 15 && (
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>
                        Non-Competitive: {formatPercent(metric.nonCompetitive.amountShare)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                  <span>
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '2px', marginRight: '6px' }}></span>
                    {formatCompactCurrency(metric.competitive.totalValue)} competitive
                  </span>
                  <span>
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#f59e0b', borderRadius: '2px', marginRight: '6px' }}></span>
                    {formatCompactCurrency(metric.nonCompetitive.totalValue)} non-competitive
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  borderRadius: '8px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a'
                }}
              >
                <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>
                  1 in {Math.round(1 / (metric.nonCompetitive.countShare / 100))} contracts awarded without competition
                  {metric.nonCompetitive.amountShare > 30 && ' — this is high and may need review'}
                </div>
              </div>
            </div>

            {/* Section 2: Who's Getting the Money? */}
            <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
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
                Section 2: Who's Getting the Money?
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                    Top Vendor
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: getHealthColor(metric.competitive.top1VendorShare, 20) }}>
                    {formatPercent(metric.competitive.top1VendorShare)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    of all spending {metric.competitive.top1VendorShare > 20 && '⚠️ High concentration'}
                  </div>
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                    Top 10 Vendors
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: getHealthColor(metric.competitive.top10VendorShare, 60) }}>
                    {formatPercent(metric.competitive.top10VendorShare)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    of all spending {metric.competitive.top10VendorShare > 60 && '⚠️ High concentration'}
                  </div>
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                    Typical Contract
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                    {formatCompactCurrency(metric.competitive.medianAwardSize)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    median award size
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                  Top Companies
                </div>
                {metric.competitive.topVendors.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                    No vendor data available for this year.
                  </div>
                ) : (
                  <div>
                    {metric.competitive.topVendors.slice(0, 10).map((vendor, idx) => {
                      const maxValue = metric.competitive.topVendors[0].totalValue
                      const widthPercent = (vendor.totalValue / maxValue) * 100

                      return (
                        <div key={vendor.name} style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                            <span style={{ fontWeight: 500, color: '#111827' }}>
                              {idx + 1}. {vendor.name}
                            </span>
                            <span style={{ fontWeight: 600, color: '#3b82f6', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                              {formatCompactCurrency(vendor.totalValue)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${widthPercent}%`,
                                  height: '100%',
                                  backgroundColor: idx === 0 ? '#3b82f6' : '#93c5fd',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '11px', color: '#6b7280', width: '60px', textAlign: 'right' }}>
                              {vendor.count} {vendor.count === 1 ? 'contract' : 'contracts'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: What Are We Buying? */}
            <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
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
            </div>
          </>
        )}

        {capitalLoading && (
          <div style={{ padding: '40px 20px', color: '#6b7280', fontSize: '16px', textAlign: 'center' }}>
            Loading neighborhood investment data...
          </div>
        )}

        {capitalError && (
          <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
            Neighborhood investment data unavailable: {capitalError}
          </div>
        )}

        {capitalData && (
          <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Section 4: Your Neighborhood
            </div>
            <div
              style={{
                fontSize: '48px',
                fontWeight: 'bold',
                color: '#111827',
                lineHeight: 1,
                marginTop: '12px'
              }}
            >
              {formatCompactCurrency(capitalData.totalInvestment)}
            </div>
            <div
              style={{
                fontSize: '15px',
                color: '#6b7280',
                marginTop: '12px'
              }}
            >
              planned for infrastructure and capital projects
            </div>

            <div
              style={{
                marginTop: '24px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}
            >
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                  Everyone's Projects
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                  {formatCompactCurrency(capitalData.cityWideInvestment)}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {formatPercent((capitalData.cityWideInvestment / capitalData.totalInvestment) * 100)} of total
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Benefits all residents
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                  Neighborhood Projects
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                  {formatCompactCurrency(capitalData.wardSpecificInvestment)}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {formatPercent((capitalData.wardSpecificInvestment / capitalData.totalInvestment) * 100)} of total
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Across {capitalData.wardCount} wards
                </div>
              </div>
            </div>

            {/* Ward Map */}
            {wardMapData && !wardMapLoading && !wardMapError && (
              <div style={{ marginTop: '32px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                  Investment Map by Ward
                </div>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
                  <svg
                    viewBox="0 0 800 600"
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '400px'
                    }}
                  >
                    {wardMapData.features.map((feature, idx) => {
                      const investment = feature.properties.total_investment || 0
                      const maxInvestment = wardMapData.metadata.maxInvestment || 1
                      const intensity = investment / maxInvestment

                      // Color scale from light blue to dark blue
                      const color = investment === 0
                        ? '#e5e7eb'
                        : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`

                      // Convert GeoJSON coordinates to SVG path
                      const coordinates = feature.geometry.type === 'Polygon'
                        ? feature.geometry.coordinates[0]
                        : feature.geometry.coordinates[0][0]

                      if (!coordinates || coordinates.length === 0) return null

                      // Simple bounding box calculation for Toronto (approximation)
                      const minLng = -79.65
                      const maxLng = -79.1
                      const minLat = 43.57
                      const maxLat = 43.85

                      const pathData = coordinates
                        .map((coord, i) => {
                          const [lng, lat] = coord
                          // Project lat/lng to SVG coordinates
                          const x = ((lng - minLng) / (maxLng - minLng)) * 800
                          const y = ((maxLat - lat) / (maxLat - minLat)) * 600
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                        })
                        .join(' ') + ' Z'

                      return (
                        <g key={idx}>
                          <path
                            d={pathData}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth="2"
                            style={{ cursor: 'pointer' }}
                          >
                            <title>{`${feature.properties.ward_name}: ${formatCompactCurrency(investment)}`}</title>
                          </path>
                        </g>
                      )
                    })}
                  </svg>
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6b7280' }}>
                    <span>Lighter</span>
                    <div style={{ flex: 1, height: '8px', background: 'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 1))', borderRadius: '4px' }}></div>
                    <span>More Investment</span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
                    Hover over a ward to see details
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '24px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                Which neighborhoods get the most?
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#16a34a', marginBottom: '8px', fontWeight: 600 }}>
                    Most Funded
                  </div>
                  {capitalData.topWards.map((ward, idx) => (
                    <div
                      key={ward.ward_number}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        fontSize: '12px',
                        borderBottom: idx < 4 ? '1px solid #f1f5f9' : 'none'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#111827', fontWeight: 500 }}>{ward.ward_name}</span>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {ward.projectCount} projects • {ward.topCategory}
                        </div>
                      </div>
                      <span style={{ color: '#16a34a', fontWeight: 600, marginLeft: '12px' }}>
                        {formatCompactCurrency(ward.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#dc2626', marginBottom: '8px', fontWeight: 600 }}>
                    Least Funded
                  </div>
                  {capitalData.bottomWards.map((ward, idx) => (
                    <div
                      key={ward.ward_number}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        fontSize: '12px',
                        borderBottom: idx < 4 ? '1px solid #f1f5f9' : 'none'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#111827', fontWeight: 500 }}>{ward.ward_name}</span>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {ward.projectCount} projects • {ward.topCategory}
                        </div>
                      </div>
                      <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: '12px' }}>
                        {formatCompactCurrency(ward.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '8px',
                  border: '1px solid #fde68a'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                  Why the gap?
                </div>
                <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>
                  The most-funded neighborhood gets <strong>{formatCount(Math.round(capitalData.governance.disparityRatio))}x more</strong> investment than the least-funded.
                  {capitalData.governance.disparityRatio > 100 && ' This gap may reflect ward size, population, infrastructure condition, or political priorities.'}
                </div>
              </div>
            </div>

            {showCapitalDetails && (
              <>
                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                    By Type of Project
                  </div>
                  {capitalData.categoryBreakdown.map((category) => (
                    <div
                      key={category.name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        fontSize: '12px',
                        borderBottom: '1px solid #f1f5f9'
                      }}
                    >
                      <div>
                        <span style={{ color: '#111827', fontWeight: 500 }}>{category.name}</span>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {category.projectCount} projects
                        </div>
                      </div>
                      <span style={{ color: '#0f172a', fontWeight: 600 }}>
                        {formatCompactCurrency(category.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                    Biggest Projects
                  </div>
                  {capitalData.topProjects.slice(0, 10).map((project, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 0',
                        fontSize: '12px',
                        borderBottom: idx < 9 ? '1px solid #f1f5f9' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#111827', fontWeight: 500, flex: 1 }}>
                          {project.project_name}
                        </span>
                        <span style={{ color: '#2563eb', fontWeight: 600, marginLeft: '12px' }}>
                          {formatCompactCurrency(project.amount)}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {project.ward_name} • {project.program_name} • {project.category}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={() => setShowCapitalDetails(!showCapitalDetails)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#475569',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              {showCapitalDetails ? '− Hide details' : '+ Show categories & projects'}
            </button>
          </div>
        )}

        {/* Section 5: Council Decisions */}
        {!councilLoading && !councilError && councilData && (
          <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
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
              Section 5: Council Decisions
            </div>

            {/* Last Updated Timestamp */}
            {councilData.timestamp && (
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '16px' }}>
                Last updated: {new Date(councilData.timestamp).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            )}

            {/* Big Number */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', fontWeight: 700, color: '#111827', lineHeight: '1' }}>
                {councilData.metadata.total_motions}
              </div>
              <div style={{ fontSize: '15px', color: '#6b7280', marginTop: '8px' }}>
                motions voted on in the past year ({councilData.metadata.pass_rate}% passed)
              </div>
            </div>

            {/* Recent Decisions List */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                Recent Decisions
              </div>
              {councilData.recent_decisions.slice(0, 10).map((decision, idx) => (
                <div key={decision.motion_id || idx} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                        {decision.motion_title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        {decision.meeting_date} • {getCategoryLabel(decision.motion_category)}
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: decision.vote_outcome === 'passed' ? '#d1fae5' : '#fee2e2',
                      color: decision.vote_outcome === 'passed' ? '#065f46' : '#991b1b',
                      whiteSpace: 'nowrap'
                    }}>
                      {decision.vote_outcome === 'passed' ? 'Passed' : 'Failed'}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                    {decision.yes_votes} Yes • {decision.no_votes} No • {decision.absent_votes} Absent
                  </div>
                </div>
              ))}
            </div>

            {/* Decision Categories */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                Decisions by Category
              </div>
              {councilData.decision_categories.slice(0, 7).map((cat, idx) => {
                const maxPassRate = Math.max(...councilData.decision_categories.map(c => c.pass_rate))
                const widthPercent = (cat.pass_rate / (maxPassRate || 100)) * 100

                return (
                  <div key={cat.category} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 500, color: '#111827' }}>
                        {cat.label} <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: 400 }}>(auto-categorized)</span>
                      </span>
                      <span style={{ fontWeight: 600, color: '#3b82f6' }}>
                        {cat.pass_rate.toFixed(1)}% passed
                      </span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${widthPercent}%`,
                        height: '100%',
                        backgroundColor: cat.pass_rate > 80 ? '#10b981' : cat.pass_rate > 50 ? '#3b82f6' : '#f59e0b',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {cat.passed} passed, {cat.failed} failed ({cat.total_motions} total)
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Lobbyist Activity Card */}
            {councilData.lobbying_summary && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                  Lobbyist Activity
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}
                >
                  <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                      Active Registrations
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                      {councilData.lobbying_summary.active_registrations.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      lobbying the city
                    </div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }}>
                      Communications
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                      {councilData.lobbying_summary.recent_communications.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      recent contacts
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
                  <strong>Top topics:</strong> {councilData.lobbying_summary.top_subjects.slice(0, 3).map(getCategoryLabel).join(', ')}
                </div>
              </div>
            )}

            {/* Explainer */}
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', marginTop: '24px' }}>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
                This section shows recent decisions made by Toronto City Council. Each motion is voted on by councillors (Yes, No, or Absent). A motion passes when it receives a majority of Yes votes. Lobbyist activity shows who is attempting to influence decisions—it does not indicate that lobbying caused specific outcomes, only that influence attempts occurred.
              </div>
            </div>
          </div>
        )}

        {/* Section 6: What You Should Know */}
        <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
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
            Section 6: What You Should Know
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
            <div>
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
      </div>
    </div>
  )
}
