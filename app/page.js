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
    description: 'Where the money comes from and where it goes, with summary and flow views.'
  },
  {
    id: 'contracts',
    href: '/contracts',
    title: 'Contracts',
    description: 'How much the City awards in contracts and who receives them.'
  },
  {
    id: 'spending',
    href: '/spending',
    title: 'Spending by Type',
    description: 'What the City buys and which departments spend the most.'
  },
  {
    id: 'wards',
    href: '/wards',
    title: 'By Ward',
    description: 'Capital investment by neighborhood and ward.'
  },
  {
    id: 'council',
    href: '/council',
    title: 'Council Decisions',
    description: 'Voting records, motions, and decision trends.'
  },
  {
    id: 'budget',
    href: '/budget',
    title: 'Budget vs Actual',
    description: 'Planned vs actual spending with clear data limitations.'
  },
  {
    id: 'about',
    href: '/about',
    title: 'About & Sources',
    description: 'Methodology, glossary, and links to datasets.'
  }
]

const buildPreview = (state, builder) => {
  if (state.loading) {
    return { tone: 'muted', lines: ['Loading preview...'] }
  }
  if (state.error || !state.data) {
    return { tone: 'error', lines: ['Preview unavailable'] }
  }
  const result = builder(state.data) || {}
  return {
    tone: 'default',
    lines: result.lines || [],
    meta: result.meta || null
  }
}

const getPreviewStyles = (tone) => {
  if (tone === 'error') {
    return { color: '#b91c1c' }
  }
  if (tone === 'muted') {
    return { color: '#9ca3af' }
  }
  return { color: '#374151' }
}

const renderPreview = (preview) => {
  if (!preview || preview.lines.length === 0) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...getPreviewStyles(preview.tone) }}>
      {preview.lines.map((line, idx) => (
        <div key={idx} style={{ fontSize: '12px', lineHeight: '1.4' }}>
          {line}
        </div>
      ))}
      {preview.meta && (
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
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
    <div style={{ padding: '32px 20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: '#111827', fontWeight: 700 }}>
          Toronto Money Flow
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '15px' }}>
          Explore how Toronto raises and spends money, with section-specific views and sources.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}
      >
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            style={{
              textDecoration: 'none',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              color: '#111827'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700 }}>{section.title}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
              {section.description}
            </div>
            {renderPreview(previewMap[section.id])}
            <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
              View section →
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: '24px', fontSize: '12px', color: '#6b7280' }}>
        Each section has its own year selector and methodology notes.
      </div>
    </div>
  )
}
