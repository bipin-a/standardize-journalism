'use client'

import { useState, useEffect } from 'react'
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
  const [hoveredWard, setHoveredWard] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedWard, setSelectedWard] = useState(null)
  const [wardProjects, setWardProjects] = useState(null)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState(null)

  // Fetch ward projects when a ward is selected
  useEffect(() => {
    if (!selectedWard) {
      setWardProjects(null)
      return
    }

    const fetchWardProjects = async () => {
      setProjectsLoading(true)
      setProjectsError(null)
      try {
        const response = await fetch(`/api/ward-projects?ward=${selectedWard.ward_number}&year=${year}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load projects')
        }
        setWardProjects(data)
      } catch (error) {
        setProjectsError(error.message)
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchWardProjects()
  }, [selectedWard, year])

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
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb', position: 'relative' }}>
            <svg
              viewBox="0 0 800 600"
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '400px'
              }}
              onMouseLeave={() => setHoveredWard(null)}
            >
              {wardMapData.features.map((feature, idx) => {
                const investment = feature.properties.total_investment || 0
                const maxInvestment = wardMapData.metadata?.maxInvestment || 1
                const intensity = investment / maxInvestment
                const isHovered = hoveredWard?.ward_number === feature.properties.ward_number

                const color = investment === 0
                  ? '#e5e7eb'
                  : isHovered
                    ? `rgba(37, 99, 235, ${0.4 + intensity * 0.6})`
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
                      stroke={isHovered ? '#1d4ed8' : selectedWard?.ward_number === feature.properties.ward_number ? '#0066CC' : '#ffffff'}
                      strokeWidth={isHovered || selectedWard?.ward_number === feature.properties.ward_number ? '3' : '2'}
                      style={{ 
                        cursor: 'pointer',
                        transition: 'fill 0.15s ease, stroke 0.15s ease'
                      }}
                      onClick={() => {
                        setSelectedWard({
                          ward_number: feature.properties.ward_number,
                          ward_name: feature.properties.ward_name,
                          investment: investment
                        })
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.closest('svg').parentElement.getBoundingClientRect()
                        const svgRect = e.currentTarget.closest('svg').getBoundingClientRect()
                        setHoveredWard({
                          ward_number: feature.properties.ward_number,
                          ward_name: feature.properties.ward_name,
                          investment: investment,
                          project_count: feature.properties.project_count || 0,
                          top_category: feature.properties.top_category || 'Various'
                        })
                        setTooltipPos({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top - 10
                        })
                      }}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.closest('svg').parentElement.getBoundingClientRect()
                        setTooltipPos({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top - 10
                        })
                      }}
                      onMouseLeave={() => setHoveredWard(null)}
                    />
                  </g>
                )
              })}
            </svg>

            {/* Custom Tooltip */}
            {hoveredWard && (
              <div
                style={{
                  position: 'absolute',
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                  transform: 'translate(-50%, -100%)',
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  pointerEvents: 'none',
                  zIndex: 1000,
                  minWidth: '180px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  marginBottom: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid rgba(255,255,255,0.15)'
                }}>
                  {formatWardLabel(hoveredWard.ward_number, hoveredWard.ward_name)}
                </div>
                <div style={{ 
                  fontSize: '22px', 
                  fontWeight: 700, 
                  color: '#60a5fa',
                  marginBottom: '8px'
                }}>
                  {formatCompactCurrency(hoveredWard.investment)}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '4px',
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.7)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Projects</span>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{hoveredWard.project_count}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Top Category</span>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{hoveredWard.top_category}</span>
                  </div>
                </div>
                {/* Tooltip arrow */}
                <div style={{
                  position: 'absolute',
                  bottom: '-6px',
                  left: '50%',
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderTop: 'none',
                  borderLeft: 'none'
                }} />
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6b7280' }}>
              <span>Less</span>
              <div style={{ flex: 1, height: '8px', background: 'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 1))', borderRadius: '4px' }}></div>
              <span>More Investment</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
              Click on a ward to see project details
            </div>
          </div>
        </div>
      )}

      {/* Ward Projects Drill-down Panel */}
      {selectedWard && (
        <div style={{
          marginTop: '24px',
          backgroundColor: '#fff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.7, marginBottom: '4px', letterSpacing: '0.5px' }}>
                Ward {selectedWard.ward_number}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600 }}>
                {selectedWard.ward_name}
              </div>
            </div>
            <button
              onClick={() => setSelectedWard(null)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '16px' }}>
            {projectsLoading && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                <div style={{ marginBottom: '8px' }}>Loading projects...</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Fetching data for {selectedWard.ward_name}</div>
              </div>
            )}

            {projectsError && (
              <div style={{ padding: '20px', backgroundColor: '#fef2f2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
                {projectsError}
              </div>
            )}

            {wardProjects && !projectsLoading && (
              <>
                {/* Summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0066CC' }}>
                      {formatCompactCurrency(wardProjects.totalInvestment)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', textTransform: 'uppercase' }}>
                      Total Investment
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                      {wardProjects.projectCount}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', textTransform: 'uppercase' }}>
                      Projects
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                      {wardProjects.categoryBreakdown.length}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', textTransform: 'uppercase' }}>
                      Categories
                    </div>
                  </div>
                </div>

                {/* Category breakdown */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                    Investment by Category
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {wardProjects.categoryBreakdown.map((cat) => (
                      <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', color: '#374151' }}>{cat.name}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                              {formatCompactCurrency(cat.amount)}
                            </span>
                          </div>
                          <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${cat.share}%`,
                                backgroundColor: '#0066CC',
                                borderRadius: '3px',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Projects list */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                    All Projects ({wardProjects.projects.length})
                  </div>
                  <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    {wardProjects.projects.map((project, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#fff',
                          borderRadius: '6px',
                          marginBottom: '6px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                              <span style={{ color: '#6b7280', fontWeight: 500, marginRight: '6px' }}>{idx + 1}.</span>
                              {project.project_name}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {project.categories.map((cat, catIdx) => (
                                <span
                                  key={catIdx}
                                  style={{
                                    fontSize: '10px',
                                    padding: '3px 8px',
                                    backgroundColor: '#e0f2fe',
                                    color: '#0369a1',
                                    borderRadius: '4px',
                                    fontWeight: 500
                                  }}
                                >
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0066CC', marginLeft: '16px' }}>
                            {formatCompactCurrency(project.amount)}
                          </div>
                        </div>
                        
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 500 }}>Program:</span> {project.programs.join(', ')}
                        </div>

                        {/* Budget for selected year */}
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 500 }}>{year} Budget:</span> {formatCompactCurrency(project.amount)}
                        </div>

                        {/* Links */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <a
                            href={project.links.toronto_search}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              padding: '5px 10px',
                              backgroundColor: '#0066CC',
                              color: '#fff',
                              borderRadius: '5px',
                              textDecoration: 'none',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            🔍 Search Toronto.ca
                          </a>
                          <a
                            href={project.links.open_data}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              padding: '5px 10px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              borderRadius: '5px',
                              textDecoration: 'none',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: '1px solid #e2e8f0'
                            }}
                          >
                            📊 Open Data
                          </a>
                          {project.links.major_projects && (
                            <a
                              href={project.links.major_projects}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '11px',
                                padding: '5px 10px',
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                borderRadius: '5px',
                                textDecoration: 'none',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                border: '1px solid #fde68a'
                              }}
                            >
                              🏗️ Major Project
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ward links */}
                <div style={{
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                    Official Sources & Reports
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <a
                      href={wardProjects.links.ward_profile}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#0066CC',
                        textDecoration: 'none',
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      📍 Ward Profile →
                    </a>
                    <a
                      href={wardProjects.links.capital_budget_data}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#0066CC',
                        textDecoration: 'none',
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      📁 Open Dataset →
                    </a>
                    {wardProjects.links.budget_overview && (
                      <a
                        href={wardProjects.links.budget_overview}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '12px',
                          color: '#0066CC',
                          textDecoration: 'none',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        📄 City Budget Info →
                      </a>
                    )}
                    {wardProjects.links.capital_variance_report && (
                      <a
                        href={wardProjects.links.capital_variance_report}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '12px',
                          color: '#0066CC',
                          textDecoration: 'none',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        📊 {wardProjects.displayYear || year} Variance Report (PDF) →
                      </a>
                    )}
                  </div>
                </div>
              </>
            )}
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
