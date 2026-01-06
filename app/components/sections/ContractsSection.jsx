'use client'

import {
  formatCompactCurrency,
  formatCount,
  formatPercent,
  getHealthColor
} from '../../utils/formatters'

const ContractsSection = ({ year, metric, loading, error }) => {
  if (loading) {
    return (
      <div style={{ padding: '32px 20px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
        Loading contract data...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
        Contract data unavailable: {error}
      </div>
    )
  }

  if (!metric) {
    return null
  }

  return (
    <>
      {/* Section 1: City Spending on Contracts */}
      <div style={{ padding: '32px 20px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            Year: {year}
          </div>
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
            Section 2: Who's Getting the Money?
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            Year: {year}
          </div>
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
            {metric.competitive.topVendors?.[0]?.name && (
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                Top vendor: {metric.competitive.topVendors[0].name}
              </div>
            )}
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

      <div
        style={{
          margin: '0 20px 32px',
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
    </>
  )
}

export default ContractsSection
