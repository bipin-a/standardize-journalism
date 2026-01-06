'use client'

import { useState } from 'react'
import { formatCompactCurrency, formatCount, formatPercent } from '../../utils/formatters'
import { formatWardLabel } from '../../utils/labels'

const WardsSection = ({
  year,
  capitalData,
  capitalLoading,
  capitalError,
  wardMapData,
  wardMapLoading,
  wardMapError
}) => {
  const [showCapitalDetails, setShowCapitalDetails] = useState(false)

  if (capitalLoading) {
    return (
      <div style={{ padding: '40px 20px', color: '#6b7280', fontSize: '16px', textAlign: 'center' }}>
        Loading neighborhood investment data...
      </div>
    )
  }

  if (capitalError) {
    return (
      <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
        Neighborhood investment data unavailable: {capitalError}
      </div>
    )
  }

  if (!capitalData) {
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
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          Section 4: Your Neighborhood
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
                const maxInvestment = wardMapData.metadata?.maxInvestment || 1
                const intensity = investment / maxInvestment

                const color = investment === 0
                  ? '#e5e7eb'
                  : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`

                const coordinates = feature.geometry.type === 'Polygon'
                  ? feature.geometry.coordinates[0]
                  : feature.geometry.coordinates[0][0]

                if (!coordinates || coordinates.length === 0) return null

                const minLng = -79.65
                const maxLng = -79.1
                const minLat = 43.57
                const maxLat = 43.85

                const pathData = coordinates
                  .map((coord, i) => {
                    const [lng, lat] = coord
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
                      <title>{`${formatWardLabel(feature.properties.ward_number, feature.properties.ward_name)}: ${formatCompactCurrency(investment)}`}</title>
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
                  <span style={{ color: '#111827', fontWeight: 500 }}>
                    {formatWardLabel(ward.ward_number, ward.ward_name)}
                  </span>
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
                  <span style={{ color: '#111827', fontWeight: 500 }}>
                    {formatWardLabel(ward.ward_number, ward.ward_name)}
                  </span>
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
  )
}

export default WardsSection
