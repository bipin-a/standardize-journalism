'use client'

import Link from 'next/link'
import { useApiData } from './utils/hooks/useApiData'
import {
  formatCompactCurrency,
  formatCount,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent
} from './utils/formatters'

const SECTIONS = [
  {
    id: 'money-flow',
    href: '/money-flow',
    title: 'Money Flow',
    description: 'Revenue sources and expenditure destinations'
  },
  {
    id: 'contracts',
    href: '/contracts',
    title: 'Contracts',
    description: 'Contract awards and vendor distribution'
  },
  {
    id: 'spending',
    href: '/spending',
    title: 'Spending',
    description: 'Departmental breakdown by category'
  },
  {
    id: 'wards',
    href: '/wards',
    title: 'Wards',
    description: 'Capital investment by neighborhood'
  },
  {
    id: 'council',
    href: '/council',
    title: 'Council',
    description: 'Voting records and motion outcomes'
  },
  {
    id: 'budget',
    href: '/budget',
    title: 'Budget',
    description: 'Planned versus actual spending'
  },
  {
    id: 'about',
    href: '/about',
    title: 'About',
    description: 'Methodology and data sources'
  }
]

const buildPreview = (state, builder) => {
  if (state.loading) {
    return { tone: 'muted', lines: ['—'] }
  }
  if (state.error || !state.data) {
    return { tone: 'error', lines: ['—'] }
  }
  const result = builder(state.data) || {}
  return {
    tone: 'default',
    lines: result.lines || [],
    meta: result.meta || null
  }
}

const renderPreview = (preview) => {
  if (!preview || preview.lines.length === 0) {
    return null
  }

  const getColor = () => {
    if (preview.tone === 'error') return '#94a3b8'
    if (preview.tone === 'muted') return '#94a3b8'
    return '#475569'
  }

  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
      {preview.lines.map((line, idx) => (
        <div key={idx} style={{ 
          fontSize: '13px', 
          color: getColor(),
          fontVariantNumeric: 'tabular-nums',
          marginBottom: '4px'
        }}>
          {line}
        </div>
      ))}
      {preview.meta && (
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
          {preview.meta}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const moneyFlowState = useApiData('/api/money-flow')
  const metricState = useApiData('/api/metric')
  const capitalState = useApiData('/api/capital-by-ward')
  const councilState = useApiData('/api/council-decisions')
  const budgetState = useApiData('/api/budget-vs-actual')

  const moneyFlowPreview = buildPreview(moneyFlowState, (data) => {
    const rawRevenueTotal = data?.revenue?.reportedTotal ?? data?.revenue?.lineItemTotal ?? data?.revenue?.total
    const rawExpenseTotal = data?.expenditure?.reportedTotal ?? data?.expenditure?.lineItemTotal ?? data?.expenditure?.total
    const rawBalance = data?.balance?.reported?.amount ?? data?.balance?.amount
    const revenueTotal = Number.isFinite(rawRevenueTotal) ? rawRevenueTotal : null
    const expenseTotal = Number.isFinite(rawExpenseTotal) ? rawExpenseTotal : null
    const balance = Number.isFinite(rawBalance) ? rawBalance : null
    const balanceLabel = balance === null ? 'Balance' : (balance >= 0 ? 'Surplus' : 'Deficit')

    return {
      lines: [
        `In ${formatCompactCurrency(revenueTotal)} · Out ${formatCompactCurrency(expenseTotal)}`,
        balance === null
          ? 'Balance unavailable'
          : `${balanceLabel} ${formatSignedCurrency(balance)}`
      ],
      meta: data?.year ? `Year ${data.year}` : null
    }
  })

  const contractsPreview = buildPreview(metricState, (data) => {
    const competitiveTotal = Number.isFinite(data?.competitive?.totalValue) ? data.competitive.totalValue : 0
    const nonCompetitiveTotal = Number.isFinite(data?.nonCompetitive?.totalValue) ? data.nonCompetitive.totalValue : 0
    const totalValue = competitiveTotal + nonCompetitiveTotal
    const totalContracts = (data?.competitive?.contractCount || 0) + (data?.nonCompetitive?.contractCount || 0)
    const nonCompetitiveShare = Number.isFinite(data?.nonCompetitive?.amountShare)
      ? data.nonCompetitive.amountShare
      : null
    return {
      lines: [
        `Total ${formatCompactCurrency(totalValue)} · ${formatCount(totalContracts)} contracts`,
        `Non-competitive ${formatPercent(nonCompetitiveShare)}`
      ],
      meta: data?.year ? `Year ${data.year}` : null
    }
  })

  const spendingPreview = buildPreview(metricState, (data) => {
    const topDivision = data?.competitive?.divisionBreakdown?.[0]
    const topCategory = data?.competitive?.categoryBreakdown?.[0]
    const lines = []

    if (topDivision) {
      lines.push(`Top department: ${topDivision.name} (${formatCompactCurrency(topDivision.totalValue)})`)
    }
    if (topCategory) {
      lines.push(`Top category: ${topCategory.name} (${formatCompactCurrency(topCategory.totalValue)})`)
    }

    return {
      lines: lines.length ? lines : ['Department and category breakdown'],
      meta: data?.year ? `Year ${data.year}` : null
    }
  })

  const wardsPreview = buildPreview(capitalState, (data) => {
    const topWard = data?.topWards?.[0]
    const lines = [
      `Total ${formatCompactCurrency(data?.totalInvestment)} · ${formatCount(data?.wardCount)} wards`
    ]

    if (topWard) {
      lines.push(`Top ward: Ward ${topWard.ward_number} - ${topWard.ward_name}`)
    }

    return {
      lines,
      meta: data?.year ? `Year ${data.year}` : null
    }
  })

  const councilPreview = buildPreview(councilState, (data) => {
    const metadata = data?.metadata || {}
    const passRate = Number.isFinite(Number(metadata.pass_rate))
      ? Number(metadata.pass_rate)
      : null
    return {
      lines: [
        `${formatCount(metadata.total_motions)} motions · ${formatPercent(passRate)} passed`,
        `${formatCount(metadata.meeting_count)} meetings`
      ],
      meta: metadata.year ? `Year ${metadata.year}` : null
    }
  })

  const budgetPreview = buildPreview(budgetState, (data) => {
    const plannedTotal = Number.isFinite(data?.plannedTotal) ? data.plannedTotal : null
    const actualTotal = Number.isFinite(data?.actualTotal) ? data.actualTotal : null
    const variancePct = Number.isFinite(data?.variancePct) ? data.variancePct : null
    return {
      lines: [
        `Planned ${formatCompactCurrency(plannedTotal)} · Actual ${formatCompactCurrency(actualTotal)}`,
        `Variance ${formatSignedPercent(variancePct)}`
      ],
      meta: data?.year ? `Year ${data.year}` : null
    }
  })

  const previewMap = {
    'money-flow': moneyFlowPreview,
    contracts: contractsPreview,
    spending: spendingPreview,
    wards: wardsPreview,
    council: councilPreview,
    budget: budgetPreview
  }

  return (
    <div style={{ 
      padding: '48px 24px 96px',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      {/* Hero Section */}
      <header style={{ marginBottom: '56px' }}>
        <h1 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '36px', 
          color: '#0f172a',
          fontWeight: 600,
          letterSpacing: '-0.75px',
          lineHeight: 1.2
        }}>
          Toronto Civic Data Standardized
        </h1>
        <p style={{ 
          margin: 0, 
          color: '#64748b', 
          fontSize: '17px',
          lineHeight: '1.7',
          maxWidth: '520px'
        }}>
          Explore how the city raises and allocates public funds. 
          Each section includes its own methodology and data sources.
        </p>
      </header>

      {/* Quick Stats Row */}
      <section style={{ 
        marginBottom: '56px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px'
      }}>
        {[
          { label: 'Revenue', value: moneyFlowPreview.lines?.[0]?.split('·')[0]?.replace('In ', '') || '—' },
          { label: 'Expenditure', value: moneyFlowPreview.lines?.[0]?.split('·')[1]?.replace(' Out ', '') || '—' },
          { label: 'Contracts', value: contractsPreview.lines?.[0]?.split('·')[0]?.replace('Total ', '') || '—' }
        ].map((stat, idx) => (
          <div key={idx} style={{ 
            background: '#fff',
            padding: '24px 20px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ 
              fontSize: '12px', 
              color: '#64748b',
              fontWeight: 500,
              marginBottom: '8px'
            }}>
              {stat.label}
            </div>
            <div style={{ 
              fontSize: '24px', 
              color: '#0066CC',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.5px'
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      {/* Vision Section */}
      <section style={{ marginBottom: '56px' }}>
        <h2 style={{ 
          fontSize: '13px', 
          color: '#64748b',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            width: '20px', 
            height: '2px', 
            background: '#0066CC',
            borderRadius: '1px'
          }}></span>
          Our Vision
        </h2>
        
        {/* Vision cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '10px' }}>✨</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>Your News, Your Way</div>
            <div style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6' }}>
              Personalized views by neighborhood, interests, and concerns—so you see what matters to you.
            </div>
          </div>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '10px' }}>📬</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>Stay Informed</div>
            <div style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6' }}>
              Weekly recaps that summarize what changed and what to watch next.
            </div>
          </div>
        </div>

        {/* Core Questions - unified style */}
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#0f172a',
            marginBottom: '16px'
          }}>
            Three questions we aim to answer
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ 
                background: '#f1f5f9', 
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                color: '#0066CC',
                flexShrink: 0
              }}>1</span>
              <div style={{ fontSize: '14px', color: '#475569', paddingTop: '4px' }}>
                Where does money come from and where does it go?
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ 
                background: '#f1f5f9', 
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                color: '#0066CC',
                flexShrink: 0
              }}>2</span>
              <div style={{ fontSize: '14px', color: '#475569', paddingTop: '4px' }}>
                Is Toronto seeing a return on investment?
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ 
                background: '#f1f5f9', 
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                color: '#0066CC',
                flexShrink: 0
              }}>3</span>
              <div style={{ fontSize: '14px', color: '#475569', paddingTop: '4px' }}>
                Are leaders making good decisions?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Cards */}
      <section style={{ marginBottom: '56px' }}>
        <h2 style={{ 
          fontSize: '13px', 
          color: '#64748b',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            width: '20px', 
            height: '2px', 
            background: '#0066CC',
            borderRadius: '1px'
          }}></span>
          Explore Data
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px'
        }}>
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              style={{
                textDecoration: 'none',
                padding: '24px',
                backgroundColor: '#fff',
                display: 'block',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0066CC'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,102,204,0.12)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600,
                color: '#0f172a',
                marginBottom: '8px'
              }}>
                {section.title}
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#64748b', 
                lineHeight: '1.6'
              }}>
                {section.description}
              </div>
              {renderPreview(previewMap[section.id])}
            </Link>
          ))}
        </div>
      </section>

      {/* How to Use */}
      <section style={{ 
        marginBottom: '56px',
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        padding: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <h2 style={{ 
          fontSize: '13px', 
          color: '#64748b',
          fontWeight: 600,
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            width: '20px', 
            height: '2px', 
            background: '#0066CC',
            borderRadius: '1px'
          }}></span>
          Getting Started
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px'
        }}>
          {[
            { 
              num: '01', 
              title: 'Browse sections', 
              desc: 'Each area has its own year selector and detailed views.',
              icon: '📊'
            },
            { 
              num: '02', 
              title: 'Ask questions', 
              desc: 'Use the chat to query specific data by year, ward, or topic.',
              icon: '💬'
            },
            { 
              num: '03', 
              title: 'Share feedback', 
              desc: 'Report issues or suggest improvements via GitHub.',
              icon: '🔗'
            }
          ].map((step, idx) => (
            <div key={idx}>
              <div style={{ 
                fontSize: '24px', 
                marginBottom: '12px'
              }}>
                {step.icon}
              </div>
              <div style={{ 
                fontSize: '15px', 
                color: '#0f172a',
                fontWeight: 600,
                marginBottom: '8px'
              }}>
                {step.title}
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.6'
              }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Note */}
      <footer style={{ 
        paddingTop: '32px',
        borderTop: '1px solid #e2e8f0'
      }}>
        <p style={{ 
          fontSize: '14px', 
          color: '#64748b', 
          lineHeight: '1.7',
          margin: 0
        }}>
          This dashboard is exploratory and intended to encourage civic engagement. 
          It is not audited reporting. Data sourced from the City of Toronto Open Data Portal.
        </p>
        <p style={{ 
          fontSize: '14px', 
          color: '#64748b', 
          lineHeight: '1.7',
          margin: '16px 0 0 0'
        }}>
          <Link 
            href="https://github.com/bipin-a/standardize-journalism/issues" 
            style={{ 
              color: '#0066CC', 
              textDecoration: 'none',
              fontWeight: 500,
              borderBottom: '1px solid #99c2e8',
              paddingBottom: '1px'
            }}
          >
            Open an issue
          </Link>
          {' '}or contribute on GitHub.
        </p>
      </footer>
    </div>
  )
}
