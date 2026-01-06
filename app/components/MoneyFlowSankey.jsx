'use client'

import { useMemo, useState } from 'react'
import { sankey, sankeyJustify, sankeyLinkHorizontal } from 'd3-sankey'
import { formatCompactCurrency, formatPercent } from '../utils/formatters'

const DEFAULT_WIDTH = 960
const BASE_HEIGHT = 440
const NODE_WIDTH = 18
const NODE_PADDING = 18
const MARGIN = { top: 80, right: 200, bottom: 60, left: 200 }

// Colorblind-safe palette with semantic meaning
const COLORS = {
  // Revenue - Green tones (money coming in)
  revenue: {
    primary: '#059669',      // Emerald 600
    secondary: '#10b981',    // Emerald 500
    tertiary: '#34d399',     // Emerald 400
    quaternary: '#6ee7b7',   // Emerald 300
    light: '#a7f3d0',        // Emerald 200
    muted: '#d1fae5'         // Emerald 100
  },
  // Spending - Blue/Orange tones (money going out)
  expense: {
    publicSafety: '#dc2626',    // Red 600 - urgent services
    socialHousing: '#ea580c',   // Orange 600 - social priority
    transportation: '#d97706',  // Amber 600 - infrastructure
    environment: '#65a30d',     // Lime 600 - environmental
    culture: '#0284c7',         // Sky 600 - community
    governance: '#64748b',      // Slate 500 - administrative
    other: '#94a3b8'            // Slate 400 - other
  },
  // Special states
  deficit: '#dc2626',     // Red 600
  surplus: '#059669',     // Emerald 600
  pool: '#1e293b',        // Slate 800
  poolBorder: '#334155',  // Slate 700
  neutral: '#94a3b8'      // Slate 400
}

// Map bucket IDs to semantic colors
const REVENUE_COLOR_MAP = {
  'taxes-levies': COLORS.revenue.primary,
  'fees-services': COLORS.revenue.secondary,
  'intergov-transfers': COLORS.revenue.tertiary,
  'investment-enterprise': COLORS.revenue.quaternary,
  'contributions-assets': COLORS.revenue.light,
  'other': COLORS.revenue.muted
}

const EXPENSE_COLOR_MAP = {
  'public-safety': COLORS.expense.publicSafety,
  'social-housing': COLORS.expense.socialHousing,
  'transportation-roads': COLORS.expense.transportation,
  'environment-utilities': COLORS.expense.environment,
  'culture-recreation': COLORS.expense.culture,
  'governance-admin': COLORS.expense.governance,
  'other': COLORS.expense.other
}

const formatBillions = (value) => {
  if (!Number.isFinite(value)) return ''
  const billions = value / 1_000_000_000
  if (Math.abs(billions) >= 1) {
    return `$${billions.toFixed(1)}B`
  }
  const millions = value / 1_000_000
  return `$${millions.toFixed(0)}M`
}

const buildGraph = (revenueBuckets, expenseBuckets, balanceAmount, totalRevenue, totalExpense) => {
  const nodes = []
  const links = []

  // Sort revenue buckets by total (descending) for top-to-bottom ordering
  const sortedRevenue = [...revenueBuckets].sort((a, b) => b.total - a.total)
  const sortedExpense = [...expenseBuckets].sort((a, b) => b.total - a.total)

  sortedRevenue.forEach((bucket, index) => {
    const color = REVENUE_COLOR_MAP[bucket.id] || COLORS.revenue.muted
    nodes.push({
      id: `rev-${bucket.id}`,
      label: bucket.label,
      color,
      side: 'revenue',
      order: index,
      total: bucket.total,
      percentage: totalRevenue > 0 ? (bucket.total / totalRevenue) * 100 : 0
    })
    links.push({
      source: `rev-${bucket.id}`,
      target: 'pool',
      value: bucket.total,
      color
    })
  })

  // Add deficit as revenue source if applicable
  if (Number.isFinite(balanceAmount) && balanceAmount < 0) {
    nodes.push({
      id: 'deficit',
      label: 'Deficit',
      color: COLORS.deficit,
      side: 'revenue',
      order: sortedRevenue.length,
      total: Math.abs(balanceAmount),
      percentage: totalRevenue > 0 ? (Math.abs(balanceAmount) / totalRevenue) * 100 : 0,
      isDeficit: true
    })
    links.push({
      source: 'deficit',
      target: 'pool',
      value: Math.abs(balanceAmount),
      color: COLORS.deficit,
      isDeficit: true
    })
  }

  // Central pool node
  const poolTotal = sortedRevenue.reduce((sum, b) => sum + b.total, 0) + 
    (balanceAmount < 0 ? Math.abs(balanceAmount) : 0)
  
  nodes.push({
    id: 'pool',
    label: 'General Fund',
    color: COLORS.pool,
    side: 'pool',
    order: 0,
    total: poolTotal
  })

  sortedExpense.forEach((bucket, index) => {
    const color = EXPENSE_COLOR_MAP[bucket.id] || COLORS.expense.other
    nodes.push({
      id: `exp-${bucket.id}`,
      label: bucket.label,
      color,
      side: 'expense',
      order: index,
      total: bucket.total,
      percentage: totalExpense > 0 ? (bucket.total / totalExpense) * 100 : 0
    })
    links.push({
      source: 'pool',
      target: `exp-${bucket.id}`,
      value: bucket.total,
      color
    })
  })

  // Add surplus as expense if applicable
  if (Number.isFinite(balanceAmount) && balanceAmount > 0) {
    nodes.push({
      id: 'surplus',
      label: 'Surplus',
      color: COLORS.surplus,
      side: 'expense',
      order: sortedExpense.length,
      total: balanceAmount,
      percentage: totalExpense > 0 ? (balanceAmount / totalExpense) * 100 : 0,
      isSurplus: true
    })
    links.push({
      source: 'pool',
      target: 'surplus',
      value: balanceAmount,
      color: COLORS.surplus,
      isSurplus: true
    })
  }

  return { nodes, links }
}

const MoneyFlowSankey = ({ 
  revenueBuckets, 
  expenseBuckets, 
  balanceAmount,
  year = 2024,
  onSelectBucket,
  selectedBucketId
}) => {
  const [hoveredNode, setHoveredNode] = useState(null)
  const [hoveredLink, setHoveredLink] = useState(null)
  const [displayMode, setDisplayMode] = useState('both') // 'dollars', 'percent', 'both'

  const totalRevenue = revenueBuckets.reduce((sum, b) => sum + b.total, 0)
  const totalExpense = expenseBuckets.reduce((sum, b) => sum + b.total, 0)

  const leftCount = revenueBuckets.length + (balanceAmount < 0 ? 1 : 0)
  const rightCount = expenseBuckets.length + (balanceAmount > 0 ? 1 : 0)
  const maxSideCount = Math.max(leftCount, rightCount, 1)
  const height = Math.max(BASE_HEIGHT, maxSideCount * 52 + MARGIN.top + MARGIN.bottom)

  const graph = useMemo(
    () => buildGraph(revenueBuckets, expenseBuckets, balanceAmount, totalRevenue, totalExpense),
    [revenueBuckets, expenseBuckets, balanceAmount, totalRevenue, totalExpense]
  )

  const sankeyData = useMemo(() => {
    if (!graph.nodes.length || !graph.links.length) {
      return null
    }
    const generator = sankey()
      .nodeId((node) => node.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .nodeSort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .extent([
        [MARGIN.left, MARGIN.top],
        [DEFAULT_WIDTH - MARGIN.right, height - MARGIN.bottom]
      ])

    return generator({
      nodes: graph.nodes.map((node) => ({ ...node })),
      links: graph.links.map((link) => ({ ...link }))
    })
  }, [graph.nodes, graph.links, height])

  if (!sankeyData) {
    return null
  }

  const linkPath = sankeyLinkHorizontal()

  // Find key insights for annotations
  const largestExpense = expenseBuckets.length > 0 
    ? expenseBuckets.reduce((max, b) => b.total > max.total ? b : max, expenseBuckets[0])
    : null
  const largestExpensePercent = largestExpense && totalExpense > 0 
    ? (largestExpense.total / totalExpense) * 100 
    : 0

  const annotations = []
  if (largestExpense && largestExpensePercent > 20) {
    annotations.push({
      text: `${largestExpense.label} accounts for ${largestExpensePercent.toFixed(0)}% of spending`,
      type: 'insight'
    })
  }
  if (balanceAmount < 0) {
    const deficitPercent = totalRevenue > 0 ? (Math.abs(balanceAmount) / totalRevenue) * 100 : 0
    annotations.push({
      text: `Structural deficit of ${formatBillions(Math.abs(balanceAmount))} (${deficitPercent.toFixed(1)}% of revenue)`,
      type: 'warning'
    })
  }

  const formatNodeLabel = (node) => {
    if (displayMode === 'dollars') {
      return formatBillions(node.total || node.value)
    }
    if (displayMode === 'percent' && node.percentage !== undefined) {
      return `${node.percentage.toFixed(0)}%`
    }
    // Both mode
    const value = formatBillions(node.total || node.value)
    if (node.percentage !== undefined && node.percentage > 0) {
      return `${value} (${node.percentage.toFixed(0)}%)`
    }
    return value
  }

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Title and Subtitle */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '20px', 
          fontWeight: 700, 
          color: '#111827',
          lineHeight: 1.3
        }}>
          How the General Fund Is Raised and Spent (FY {year})
        </h2>
        <p style={{ 
          margin: '6px 0 0 0', 
          fontSize: '13px', 
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <span>All values in billions CAD</span>
          {balanceAmount < 0 && (
            <span style={{ 
              color: COLORS.deficit, 
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ 
                width: '10px', 
                height: '10px', 
                backgroundColor: COLORS.deficit, 
                borderRadius: '2px',
                display: 'inline-block'
              }} />
              Deficit shown in red
            </span>
          )}
        </p>
      </div>

      {/* Display Mode Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '6px', 
        marginBottom: '16px',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '4px' }}>Show:</span>
        {['dollars', 'percent', 'both'].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDisplayMode(mode)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: displayMode === mode ? '#111827' : '#d1d5db',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              backgroundColor: displayMode === mode ? '#111827' : 'white',
              color: displayMode === mode ? 'white' : '#374151',
              textTransform: 'capitalize'
            }}
          >
            {mode === 'both' ? '$ + %' : mode === 'dollars' ? '$' : '%'}
          </button>
        ))}
      </div>

      {/* SVG Sankey Diagram */}
      <svg
        viewBox={`0 0 ${DEFAULT_WIDTH} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Money flow sankey diagram showing Toronto's ${year} general fund revenue and expenditure`}
      >
        {/* Background */}
        <rect width={DEFAULT_WIDTH} height={height} fill="#fafafa" rx="8" />

        {/* Column Headers */}
        <text
          x={MARGIN.left - 10}
          y={40}
          textAnchor="end"
          fontSize="14"
          fontWeight="700"
          fill="#059669"
        >
          Revenue Sources
        </text>
        <text
          x={MARGIN.left - 10}
          y={56}
          textAnchor="end"
          fontSize="11"
          fill="#6b7280"
        >
          {formatBillions(totalRevenue)} total
        </text>

        <text
          x={DEFAULT_WIDTH - MARGIN.right + 10}
          y={40}
          textAnchor="start"
          fontSize="14"
          fontWeight="700"
          fill="#0284c7"
        >
          Expenditures
        </text>
        <text
          x={DEFAULT_WIDTH - MARGIN.right + 10}
          y={56}
          textAnchor="start"
          fontSize="11"
          fill="#6b7280"
        >
          {formatBillions(totalExpense)} total
        </text>

        {/* Links (flows) */}
        <g>
          {sankeyData.links.map((link, index) => {
            const isHighlighted = hoveredLink === index || 
              hoveredNode === link.source.id || 
              hoveredNode === link.target.id
            const isDeficit = link.isDeficit
            const isSurplus = link.isSurplus
            
            // Determine which bucket this link represents
            // For revenue links: source is the bucket, target is pool
            // For expense links: source is pool, target is the bucket
            const isRevenue = link.source.side === 'revenue'
            const isExpense = link.target.side === 'expense'
            const bucketNode = isRevenue ? link.source : (isExpense ? link.target : null)
            const bucketId = bucketNode ? bucketNode.id.replace(/^(rev|exp)-/, '') : null
            const side = isRevenue ? 'revenue' : (isExpense ? 'expense' : null)
            const isClickable = bucketNode && !isDeficit && !isSurplus && onSelectBucket
            const isSelected = selectedBucketId === bucketId
            
            const handleLinkClick = () => {
              if (isClickable && side && bucketId) {
                onSelectBucket(side, bucketId)
              }
            }
            
            return (
              <g key={`link-${index}`}>
                <path
                  d={linkPath(link)}
                  fill="none"
                  stroke={link.color || COLORS.neutral}
                  strokeOpacity={isSelected ? 0.8 : (isHighlighted ? 0.7 : 0.35)}
                  strokeWidth={Math.max(2, link.width)}
                  style={{ 
                    transition: 'stroke-opacity 0.2s ease',
                    cursor: isClickable ? 'pointer' : 'default'
                  }}
                  onMouseEnter={() => setHoveredLink(index)}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={handleLinkClick}
                >
                  <title>
                    {`${link.source.label} → ${link.target.label}\n${formatBillions(link.value)}${isClickable ? '\nClick to see breakdown' : ''}`}
                  </title>
                </path>
                {/* Deficit indicator pattern */}
                {isDeficit && (
                  <path
                    d={linkPath(link)}
                    fill="none"
                    stroke="white"
                    strokeOpacity={0.3}
                    strokeWidth={Math.max(2, link.width)}
                    strokeDasharray="6 4"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            )
          })}
        </g>

        {/* Nodes */}
        <g>
          {sankeyData.nodes.map((node) => {
            const isPool = node.side === 'pool'
            const x0 = isPool ? node.x0 - 3 : node.x0
            const x1 = isPool ? node.x1 + 3 : node.x1
            const y0 = node.y0
            const y1 = node.y1
            const nodeHeight = Math.max(4, y1 - y0)
            const nodeWidth = x1 - x0
            
            const isHighlighted = hoveredNode === node.id
            const isDeficit = node.isDeficit
            const isSurplus = node.isSurplus
            
            // Extract bucket ID from node ID (e.g., 'rev-taxes-levies' -> 'taxes-levies')
            const bucketId = node.id.replace(/^(rev|exp)-/, '')
            const isSelected = selectedBucketId === bucketId && !isPool && !isDeficit && !isSurplus
            const isClickable = !isPool && !isDeficit && !isSurplus && onSelectBucket

            // Label positioning
            let labelX, labelAnchor
            if (node.side === 'revenue') {
              labelX = x0 - 14
              labelAnchor = 'end'
            } else if (node.side === 'expense') {
              labelX = x1 + 14
              labelAnchor = 'start'
            } else {
              labelX = (x0 + x1) / 2
              labelAnchor = 'middle'
            }

            const labelY = (y0 + y1) / 2

            const handleNodeClick = () => {
              if (isClickable) {
                onSelectBucket(node.side, bucketId)
              }
            }

            return (
              <g 
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={handleNodeClick}
                style={{ cursor: isClickable ? 'pointer' : 'default' }}
              >
                {/* Node shadow for pool */}
                {isPool && (
                  <rect
                    x={x0 + 2}
                    y={y0 + 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    fill="rgba(0,0,0,0.1)"
                    rx={8}
                  />
                )}

                {/* Selection indicator (outline behind node) */}
                {isSelected && (
                  <rect
                    x={x0 - 3}
                    y={y0 - 3}
                    width={nodeWidth + 6}
                    height={nodeHeight + 6}
                    fill="none"
                    stroke="#111827"
                    strokeWidth={3}
                    rx={6}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                
                {/* Node rectangle */}
                <rect
                  x={x0}
                  y={y0}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill={node.color || COLORS.neutral}
                  rx={isPool ? 8 : 3}
                  stroke={isPool ? COLORS.poolBorder : (isHighlighted && !isSelected ? '#111827' : 'none')}
                  strokeWidth={isPool ? 2 : (isHighlighted && !isSelected ? 2 : 0)}
                  style={{ transition: 'stroke 0.2s ease' }}
                >
                  <title>
                    {`${node.label}\n${formatBillions(node.total || node.value)}${node.percentage ? ` (${node.percentage.toFixed(1)}%)` : ''}${isClickable ? '\nClick to see breakdown' : ''}`}
                  </title>
                </rect>

                {/* Deficit/Surplus pattern overlay */}
                {(isDeficit || isSurplus) && (
                  <rect
                    x={x0}
                    y={y0}
                    width={nodeWidth}
                    height={nodeHeight}
                    fill="url(#stripePattern)"
                    rx={3}
                    opacity={0.3}
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Pool node internal label */}
                {isPool && (
                  <>
                    <text
                      x={(x0 + x1) / 2}
                      y={y0 - 24}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="700"
                      fill="#111827"
                    >
                      General Fund
                    </text>
                    <text
                      x={(x0 + x1) / 2}
                      y={y0 - 8}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="600"
                      fill="#374151"
                    >
                      {formatBillions(node.total)}
                    </text>
                  </>
                )}

                {/* External labels for non-pool nodes */}
                {!isPool && (
                  <>
                    <text
                      x={labelX}
                      y={labelY - 6}
                      textAnchor={labelAnchor}
                      fontSize="12"
                      fontWeight="600"
                      fill={isDeficit || isSurplus ? node.color : '#111827'}
                    >
                      {node.label}
                    </text>
                    <text
                      x={labelX}
                      y={labelY + 10}
                      textAnchor={labelAnchor}
                      fontSize="11"
                      fontWeight="500"
                      fill="#6b7280"
                    >
                      {formatNodeLabel(node)}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </g>

        {/* Stripe pattern definition for deficit/surplus */}
        <defs>
          <pattern
            id="stripePattern"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="3" />
          </pattern>
        </defs>
      </svg>

      {/* Annotations / Key Takeaways */}
      {annotations.length > 0 && (
        <div style={{ 
          marginTop: '16px', 
          display: 'flex', 
          flexDirection: 'column',
          gap: '8px'
        }}>
          {annotations.map((annotation, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: annotation.type === 'warning' ? '#fef2f2' : '#f0fdf4',
                borderRadius: '8px',
                borderLeft: `4px solid ${annotation.type === 'warning' ? COLORS.deficit : COLORS.surplus}`,
                fontSize: '13px',
                color: annotation.type === 'warning' ? '#991b1b' : '#065f46',
                fontWeight: 500
              }}
            >
              <span style={{ fontSize: '14px' }}>
                {annotation.type === 'warning' ? '⚠️' : '📊'}
              </span>
              {annotation.text}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ 
        marginTop: '20px', 
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 600, 
          color: '#374151',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Legend
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              width: '14px', 
              height: '14px', 
              backgroundColor: COLORS.revenue.primary, 
              borderRadius: '3px' 
            }} />
            <span style={{ fontSize: '12px', color: '#374151' }}>Revenue</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              width: '14px', 
              height: '14px', 
              background: `linear-gradient(135deg, ${COLORS.expense.publicSafety}, ${COLORS.expense.culture})`, 
              borderRadius: '3px' 
            }} />
            <span style={{ fontSize: '12px', color: '#374151' }}>Spending</span>
          </div>
          {balanceAmount < 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                width: '14px', 
                height: '14px', 
                backgroundColor: COLORS.deficit, 
                borderRadius: '3px',
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)'
              }} />
              <span style={{ fontSize: '12px', color: '#374151' }}>Deficit</span>
            </div>
          )}
          {balanceAmount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                width: '14px', 
                height: '14px', 
                backgroundColor: COLORS.surplus, 
                borderRadius: '3px' 
              }} />
              <span style={{ fontSize: '12px', color: '#374151' }}>Surplus</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              width: '14px', 
              height: '14px', 
              backgroundColor: COLORS.pool, 
              borderRadius: '3px',
              border: `1px solid ${COLORS.poolBorder}`
            }} />
            <span style={{ fontSize: '12px', color: '#374151' }}>General Fund</span>
          </div>
        </div>
      </div>

    </div>
  )
}

export default MoneyFlowSankey
