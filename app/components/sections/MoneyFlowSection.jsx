'use client'

import { useEffect, useRef, useState } from 'react'
import GlossaryTerm from '../GlossaryTerm'
import MoneyFlowSankey from '../MoneyFlowSankey'
import CITY_BUDGET_GLOSSARY from '../../data/city_budget_glossary.json'
import { CATEGORY_RULES } from '../../data/budget-category-rules'
import {
  formatCompactCurrency,
  formatPercent,
  formatSignedCurrency,
  formatDate
} from '../../utils/formatters'

const FINANCIAL_REPORT_LINKS = {
  2024: {
    annual: 'https://www.toronto.ca/wp-content/uploads/2025/08/9515-2024-City-of-Toronto-Financial-Report.pdf',
    consolidated: 'https://www.toronto.ca/wp-content/uploads/2025/07/97e1-2024-Consolidated-Financial-Statements-07-29-2025.pdf'
  }
}

const REVENUE_BUCKETS = [
  {
    id: 'taxes-levies',
    label: 'Municipal Taxes & Levies',
    color: '#10b981',
    matches: [
      'taxation - own purposes',
      'municipal land transfer tax',
      'vacant home tax',
      'payments-in-lieu of taxation',
      'penalties and interest on taxes'
    ]
  },
  {
    id: 'fees-services',
    label: 'User Fees & Services',
    color: '#22c55e',
    matches: [
      'licences and permits',
      'transient accommodation tax',
      'rents, concessions and franchises',
      'sale of publications, equipment, etc.',
      'other fines',
      'provincial offences act'
    ]
  },
  {
    id: 'intergov-transfers',
    label: 'Federal & Provincial Transfers',
    color: '#16a34a',
    matches: [
      'ontario conditional grants',
      'canada conditional grants',
      'canada community',
      'ontario grants for tangible capital assets',
      'canada grants for tangible capital assets',
      'provincial gas tax',
      'revenue from other municipalities'
    ]
  },
  {
    id: 'investment-enterprise',
    label: 'Investment & Enterprise',
    color: '#059669',
    matches: [
      'investment income',
      'interest earned on reserves and reserve funds',
      'other revenues from government business enterprise',
      'gaming and casino revenues'
    ]
  },
  {
    id: 'contributions-assets',
    label: 'Contributions & Assets',
    color: '#34d399',
    matches: [
      'deferred revenue earned',
      'donated tangible capital assets',
      'donations',
      'contributions from non-consolidated entities',
      'gain (loss) on sale of land & capital assets'
    ]
  },
  {
    id: 'other',
    label: 'Other',
    color: '#a7f3d0',
    matches: ['other'],
    isFallback: true
  }
]

const EXPENSE_BUCKETS = [
  {
    id: 'public-safety',
    label: 'Public Safety',
    color: '#ef4444',
    matches: [
      'police',
      'fire',
      'court security',
      'prisoner transportation',
      'emergency measures',
      'protective inspection and control',
      'ambulance dispatch',
      'ambulance services'
    ]
  },
  {
    id: 'social-housing',
    label: 'Social Services & Housing',
    color: '#f97316',
    matches: [
      'general assistance',
      'public housing',
      'child care and early years learning',
      'public health services',
      'assistance to seniors'
    ]
  },
  {
    id: 'transportation-roads',
    label: 'Transportation & Roads',
    color: '#f59e0b',
    matches: [
      'transit - conventional',
      'roads - paved',
      'roads - bridges and culverts',
      'roads - traffic operations & roadside',
      'street lighting',
      'parking',
      'winter control'
    ]
  },
  {
    id: 'environment-utilities',
    label: 'Environment & Utilities',
    color: '#84cc16',
    matches: [
      'water distribution / transmission',
      'water treatment',
      'wastewater collection / conveyance',
      'wastewater treatment & disposal',
      'urban storm sewer system',
      'solid waste collection',
      'solid waste disposal',
      'waste diversion',
      'conservation authority'
    ]
  },
  {
    id: 'culture-recreation',
    label: 'Culture & Recreation',
    color: '#38bdf8',
    matches: [
      'libraries',
      'museums',
      'cultural services',
      'parks',
      'recreation programs',
      'recreation facilities'
    ]
  },
  {
    id: 'governance-admin',
    label: 'Governance & Administration',
    color: '#94a3b8',
    matches: [
      'governance',
      'corporate management',
      'program support',
      'planning and zoning',
      'building permit and inspection services',
      'provincial offences act',
      'commercial and industrial'
    ]
  },
  {
    id: 'other',
    label: 'Other',
    color: '#e2e8f0',
    matches: ['other'],
    isFallback: true
  }
]

const normalizeGlossaryTerm = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const normalizeBudgetText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const BUDGET_CATEGORY_RULES = CATEGORY_RULES.map((rule) => ({
  ...rule,
  normalizedActualKeywords: rule.actualKeywords.map(normalizeBudgetText)
}))

const buildBucketTotals = (items, bucketDefs) => {
  const buckets = bucketDefs.map(def => ({
    ...def,
    total: 0,
    percentage: 0,
    items: []
  }))
  const fallback = buckets.find(bucket => bucket.isFallback) || buckets[buckets.length - 1]
  let total = 0

  items.forEach(item => {
    const amount = Number(item.amount)
    if (!Number.isFinite(amount) || amount <= 0) return
    total += amount

    const label = normalizeGlossaryTerm(item.label)
    let bucket = buckets.find(def =>
      def.matches.some(match => label.includes(normalizeGlossaryTerm(match)))
    )
    if (!bucket) {
      bucket = fallback
    }
    bucket.total += amount
    bucket.items.push(item)
  })

  const bucketList = buckets
    .map(bucket => ({
      ...bucket,
      percentage: total > 0 ? (bucket.total / total) * 100 : 0,
      items: bucket.items.sort((a, b) => b.amount - a.amount)
    }))
    .filter(bucket => bucket.total > 0)
    .sort((a, b) => b.total - a.total)

  return { total, buckets: bucketList }
}

const findGlossaryEntry = (label) => {
  const normalized = normalizeGlossaryTerm(label)
  if (!normalized) return null
  const exactMatch = CITY_BUDGET_GLOSSARY.find(entry =>
    entry.matches.some(match => normalizeGlossaryTerm(match) === normalized)
  )
  if (exactMatch) return exactMatch
  return CITY_BUDGET_GLOSSARY.find(entry =>
    entry.matches.some(match => normalized.startsWith(normalizeGlossaryTerm(match)))
  )
}

const findBudgetCategoryForLabel = (label, categoryByName) => {
  if (!label || !categoryByName || categoryByName.size === 0) {
    return null
  }
  const normalizedLabel = normalizeBudgetText(label)
  if (!normalizedLabel) {
    return null
  }

  let bestMatch = null
  let bestKeywordLength = 0

  BUDGET_CATEGORY_RULES.forEach((rule) => {
    rule.normalizedActualKeywords.forEach((keyword) => {
      if (!keyword || !normalizedLabel.includes(keyword)) {
        return
      }
      if (keyword.length > bestKeywordLength) {
        bestMatch = rule
        bestKeywordLength = keyword.length
      }
    })
  })

  if (!bestMatch) {
    return null
  }

  const category = categoryByName.get(bestMatch.name)
  if (!category || !Number.isFinite(category.planned)) {
    return null
  }

  return { categoryName: bestMatch.name, planned: category.planned }
}

const MoneyFlowSection = ({ year, moneyFlow, loading, error, status, budgetActual }) => {
  const [moneyFlowTab, setMoneyFlowTab] = useState('sankey')
  const [flowSelection, setFlowSelection] = useState(null)
  const [showAllFlowItems, setShowAllFlowItems] = useState(false)
  const [showRevenueGapExplainer, setShowRevenueGapExplainer] = useState(false)
  const [showExpenditureGapExplainer, setShowExpenditureGapExplainer] = useState(false)
  const [activeGlossaryId, setActiveGlossaryId] = useState(null)
  const glossaryCloseRef = useRef(null)

  useEffect(() => {
    setFlowSelection(null)
    setShowAllFlowItems(false)
  }, [year])

  useEffect(() => () => {
    if (glossaryCloseRef.current) {
      clearTimeout(glossaryCloseRef.current)
    }
  }, [])

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
      const glossaryEntry = findGlossaryEntry(group.label)
      const labelNode = glossaryEntry
        ? (
            <GlossaryTerm
              term={group.label}
              entry={glossaryEntry}
              activeGlossaryId={activeGlossaryId}
              setActiveGlossaryId={setActiveGlossaryId}
              closeTimeoutRef={glossaryCloseRef}
            />
          )
        : group.label

      return (
        <div key={group.label} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
            <span style={{ fontWeight: 500, color: '#111827' }}>
              {labelNode}
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

  const renderBucketDrillDown = () => {
    if (!selectedBucket) {
      return (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Click a category to see the line items that make it up.
        </div>
      )
    }

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
              {selectedBucket.label}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {flowSelection?.side === 'revenue' ? 'Revenue bucket' : 'Expense bucket'} · {formatCompactCurrency(selectedBucket.total)} ({formatPercent(selectedBucket.percentage)})
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFlowSelection(null)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              color: '#6b7280',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ✕ Clear
          </button>
        </div>
        {(selectedBucket.id === 'other' || selectedBucket.label.toLowerCase() === 'other') && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
            "Other" appears as a named line item in the source data, and in this flow view it also groups items that don't match a bucket rule.
          </div>
        )}
        {showBudgetContext && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
            Planned amounts use Operating Budget {plannedBudgetYear} category totals (keyword match, approximate).
          </div>
        )}
        <div style={{ marginTop: '12px' }}>
          {visibleItems.map(item => {
            const glossaryEntry = findGlossaryEntry(item.label)
            const labelNode = glossaryEntry
              ? (
                  <GlossaryTerm
                    term={item.label}
                    entry={glossaryEntry}
                    activeGlossaryId={activeGlossaryId}
                    setActiveGlossaryId={setActiveGlossaryId}
                    closeTimeoutRef={glossaryCloseRef}
                  />
                )
              : item.label
            const share = selectedBucket.total > 0
              ? (item.amount / selectedBucket.total) * 100
              : 0
            const totalForSide = flowSelection?.side === 'revenue'
              ? revenueLineItemTotal
              : expenditureLineItemTotal
            const totalShare = totalForSide > 0
              ? (item.amount / totalForSide) * 100
              : 0
            const widthPercent = Math.min(100, Math.max(0, share))
            const budgetContext = showBudgetContext
              ? findBudgetCategoryForLabel(item.label, budgetCategoryByName)
              : null
            return (
              <div key={item.label} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#111827' }}>{labelNode}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {formatCompactCurrency(item.amount)} · {formatPercent(share)} bucket · {formatPercent(totalShare)} total
                  </span>
                </div>
                {budgetContext && (
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
                    Planned (Operating Budget {plannedBudgetYear}) · {budgetContext.categoryName}:{' '}
                    {formatCompactCurrency(budgetContext.planned)}
                  </div>
                )}
                <div style={{ marginTop: '6px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px' }}>
                  <div style={{ width: `${widthPercent}%`, height: '100%', borderRadius: '999px', backgroundColor: selectedBucket.color }} />
                </div>
              </div>
            )
          })}
        </div>
        {selectedItems.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllFlowItems(!showAllFlowItems)}
            style={{
              marginTop: '8px',
              fontSize: '12px',
              color: '#2563eb',
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0
            }}
          >
            {showAllFlowItems ? 'Show less' : `Show all (${selectedItems.length})`}
          </button>
        )}
      </>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '32px 20px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
        Loading money flow data...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
        <div>Money flow data unavailable: {error}</div>
        {status?.lastPublishedYear && (
          <div style={{ marginTop: '8px', color: '#7f1d1d' }}>
            Last published: {status.lastPublishedYear} data
            {status.lastModified
              ? ` (updated ${formatDate(status.lastModified) || status.lastModified})`
              : ''}
          </div>
        )}
        {status?.requestedYear && status?.lastPublishedYear &&
          status.requestedYear > status.lastPublishedYear && (
            <div style={{ marginTop: '6px', color: '#7f1d1d' }}>
              {status.requestedYear} file not yet published on CKAN.
            </div>
          )}
        {status?.datasetUrl && (
          <div style={{ marginTop: '8px' }}>
            <a
              href={status.datasetUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#991b1b', textDecoration: 'underline' }}
            >
              View dataset on CKAN
            </a>
          </div>
        )}
      </div>
    )
  }

  if (!moneyFlow) {
    return null
  }

  const revenueLineItemTotal = moneyFlow.revenue?.lineItemTotal ?? moneyFlow.revenue?.total ?? null
  const revenueReportedTotal = moneyFlow.revenue?.reportedTotal ?? null
  const revenueHeadlineTotal = revenueReportedTotal ?? revenueLineItemTotal
  const revenueReconciliation = (
    revenueReportedTotal !== null && revenueLineItemTotal !== null
  )
    ? revenueReportedTotal - revenueLineItemTotal
    : null

  const expenditureLineItemTotal = moneyFlow.expenditure?.lineItemTotal ?? moneyFlow.expenditure?.total ?? null
  const expenditureReportedTotal = moneyFlow.expenditure?.reportedTotal ?? null
  const expenditureHeadlineTotal = expenditureReportedTotal ?? expenditureLineItemTotal
  const expenditureReconciliation = (
    expenditureReportedTotal !== null && expenditureLineItemTotal !== null
  )
    ? expenditureReportedTotal - expenditureLineItemTotal
    : null

  const revenueBottomGroups = (moneyFlow.revenue?.bottomGroups || [])
    .filter(group => Number(group.amount) > 1)
    .sort((a, b) => b.amount - a.amount)
  const expenditureBottomGroups = (moneyFlow.expenditure?.bottomGroups || [])
    .filter(group => Number(group.amount) > 1)
    .sort((a, b) => b.amount - a.amount)

  const flowRevenueItems = moneyFlow.revenue?.allGroups || []
  const flowExpenseItems = moneyFlow.expenditure?.allGroups || []
  const revenueFlow = buildBucketTotals(flowRevenueItems, REVENUE_BUCKETS)
  const expenseFlow = buildBucketTotals(flowExpenseItems, EXPENSE_BUCKETS)
  const hasFlowData = flowRevenueItems.length > 0 && flowExpenseItems.length > 0
  const reportLinks = FINANCIAL_REPORT_LINKS[year] || {}
  const annualReportUrl = reportLinks.annual || null
  const consolidatedReportUrl = reportLinks.consolidated || null

  const handleSelectBucket = (side, bucket) => {
    setFlowSelection({ side, bucketId: bucket.id })
    setShowAllFlowItems(false)
  }

  const handleSankeySelectBucket = (side, bucketId) => {
    setFlowSelection({ side, bucketId })
    setShowAllFlowItems(false)
  }

  const selectedBucket = flowSelection
    ? (
        flowSelection.side === 'revenue'
          ? revenueFlow.buckets.find(bucket => bucket.id === flowSelection.bucketId)
          : expenseFlow.buckets.find(bucket => bucket.id === flowSelection.bucketId)
      )
    : null

  const selectedItems = selectedBucket?.items || []
  const visibleItems = showAllFlowItems
    ? selectedItems
    : selectedItems.slice(0, 6)

  const budgetCategories = budgetActual?.categories || []
  const budgetCategoryByName = new Map(budgetCategories.map(category => [category.name, category]))
  const plannedBudgetYear = budgetActual?.plannedYear || year
  const showBudgetContext = (flowSelection?.side === 'expenditure' || flowSelection?.side === 'expense')
    && budgetCategoryByName.size > 0

  const reportedBalance = moneyFlow.balance?.reported ?? null
  const lineItemBalance = moneyFlow.balance
  const lineItemBalanceAmount = Number.isFinite(lineItemBalance?.amount)
    ? lineItemBalance.amount
    : null
  const displayBalance = reportedBalance ?? lineItemBalance
  const displayBalanceLabel = reportedBalance ? 'Audited (FIR)' : 'Line-item'
  const netBackground = displayBalance?.isSurplus ? '#ecfdf3' : '#fef2f2'
  const netBorder = displayBalance?.isSurplus ? '#a7f3d0' : '#fecaca'
  const netText = displayBalance?.isSurplus ? '#065f46' : '#991b1b'
  const lineItemNetBackground = lineItemBalance?.isSurplus ? '#ecfdf3' : '#fef2f2'
  const lineItemNetBorder = lineItemBalance?.isSurplus ? '#a7f3d0' : '#fecaca'
  const lineItemNetText = lineItemBalance?.isSurplus ? '#065f46' : '#991b1b'

  return (
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
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        Actuals from the Financial Information Return (FIR). Planned amounts appear for matching drill-down items; see Budget vs Actual for full coverage.
      </div>

      <div style={{ marginTop: '12px', display: 'inline-flex', gap: '6px', padding: '4px', backgroundColor: '#f3f4f6', borderRadius: '999px' }}>
        <button
          type="button"
          onClick={() => { setMoneyFlowTab('sankey'); setFlowSelection(null); }}
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: moneyFlowTab === 'sankey' ? '#111827' : 'transparent',
            color: moneyFlowTab === 'sankey' ? '#f9fafb' : '#6b7280'
          }}
        >
          Sankey
        </button>
        <button
          type="button"
          onClick={() => { setMoneyFlowTab('summary'); setFlowSelection(null); }}
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: moneyFlowTab === 'summary' ? '#111827' : 'transparent',
            color: moneyFlowTab === 'summary' ? '#f9fafb' : '#6b7280'
          }}
        >
          Detailed Summary
        </button>
      </div>

      {moneyFlowTab === 'summary' && (
        <>
          {displayBalance && (
            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '999px',
                  backgroundColor: netBackground,
                  border: `1px solid ${netBorder}`,
                  color: netText,
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                {displayBalanceLabel} {displayBalance.isSurplus ? 'surplus' : 'deficit'}:{' '}
                {formatSignedCurrency(displayBalance.amount)} ({formatPercent(Math.abs(displayBalance.percentageOfRevenue))})
              </div>
              {lineItemBalance && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '999px',
                    backgroundColor: lineItemNetBackground,
                    border: `1px solid ${lineItemNetBorder}`,
                    color: lineItemNetText,
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  Line-item net (CKAN): {formatSignedCurrency(lineItemBalance.amount)}{' '}
                  ({formatPercent(Math.abs(lineItemBalance.percentageOfRevenue))})
                </div>
              )}
            </div>
          )}
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
                Money Coming In (Actuals)
              </div>
              {revenueReportedTotal !== null && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
                  Reported total (FIR summary)
                </div>
              )}
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981', marginTop: '8px' }}>
                {formatCompactCurrency(revenueHeadlineTotal)}
              </div>
              {revenueReportedTotal !== null && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
                  Named line items (CKAN): {formatCompactCurrency(revenueLineItemTotal)}
                </div>
              )}
              {revenueReconciliation !== null && (
                <>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
                    Unmapped / reconciliation: {formatSignedCurrency(revenueReconciliation)}
                    <button
                      type="button"
                      onClick={() => setShowRevenueGapExplainer(!showRevenueGapExplainer)}
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        color: '#2563eb',
                        textDecoration: 'underline',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      {showRevenueGapExplainer ? '▼' : '▶'} What's this?
                    </button>
                  </div>
                  {showRevenueGapExplainer && (
                    <div style={{
                      marginTop: '8px',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#6b7280',
                      lineHeight: '1.6'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                        What's in the gap?
                      </div>
                      These are accounting adjustments not itemized in the CKAN line items:
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                        <li>Consolidation adjustments (agencies, boards, commissions)</li>
                        <li>Deferred revenue timing adjustments</li>
                        <li>Interfund transfer eliminations</li>
                        <li>PSAB accounting standard adjustments</li>
                        <li>Prior period corrections</li>
                      </ul>
                      <div style={{ marginTop: '6px', fontSize: '10px', fontStyle: 'italic' }}>
                        Detailed breakdown is not published as Open Data.
                      </div>
                      {(annualReportUrl || consolidatedReportUrl) && (
                        <div style={{ marginTop: '8px', fontSize: '10px' }}>
                          Sources:{' '}
                          {annualReportUrl && (
                            <a
                              href={annualReportUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline', marginRight: '8px' }}
                            >
                              Annual Financial Report (PDF)
                            </a>
                          )}
                          {consolidatedReportUrl && (
                            <a
                              href={consolidatedReportUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline' }}
                            >
                              Consolidated Financial Statements (PDF)
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Biggest 7 Sources
                </div>
                {renderGroupList(moneyFlow.revenue.topGroups, '#10b981')}
              </div>

              {moneyFlow.revenue.bottomGroups.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Smallest 7 (by share)
                  </div>
                  {renderGroupList(revenueBottomGroups, '#86efac')}
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                    Smallest is relative to the full city budget, so values can still be in the tens of millions.
                  </div>
                </div>
              )}

              {revenueReconciliation !== null && (
                <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px dashed #d1d5db' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>
                    Reconciliation items (FIR only)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginTop: '4px' }}>
                    {formatSignedCurrency(revenueReconciliation)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    Not itemized in CKAN line items.
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                Money Going Out (Actuals)
              </div>
              {expenditureReportedTotal !== null && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
                  Reported total (FIR summary)
                </div>
              )}
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6', marginTop: '8px' }}>
                {formatCompactCurrency(expenditureHeadlineTotal)}
              </div>
              {expenditureReportedTotal !== null && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
                  Named line items (CKAN): {formatCompactCurrency(expenditureLineItemTotal)}
                </div>
              )}
              {expenditureReconciliation !== null && (
                <>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
                    Unmapped / reconciliation: {formatSignedCurrency(expenditureReconciliation)}
                    <button
                      type="button"
                      onClick={() => setShowExpenditureGapExplainer(!showExpenditureGapExplainer)}
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        color: '#2563eb',
                        textDecoration: 'underline',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      {showExpenditureGapExplainer ? '▼' : '▶'} What's this?
                    </button>
                  </div>
                  {showExpenditureGapExplainer && (
                    <div style={{
                      marginTop: '8px',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#6b7280',
                      lineHeight: '1.6'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                        What's in the gap?
                      </div>
                      These are accounting adjustments not itemized in the CKAN line items:
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                        <li>Consolidation adjustments (agencies, boards, commissions)</li>
                        <li>Deferred expense timing adjustments</li>
                        <li>Interfund transfer eliminations</li>
                        <li>PSAB accounting standard adjustments</li>
                        <li>Prior period corrections</li>
                      </ul>
                      <div style={{ marginTop: '6px', fontSize: '10px', fontStyle: 'italic' }}>
                        Detailed breakdown is not published as Open Data.
                      </div>
                      {(annualReportUrl || consolidatedReportUrl) && (
                        <div style={{ marginTop: '8px', fontSize: '10px' }}>
                          Sources:{' '}
                          {annualReportUrl && (
                            <a
                              href={annualReportUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline', marginRight: '8px' }}
                            >
                              Annual Financial Report (PDF)
                            </a>
                          )}
                          {consolidatedReportUrl && (
                            <a
                              href={consolidatedReportUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline' }}
                            >
                              Consolidated Financial Statements (PDF)
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Biggest 7 Costs
                </div>
                {renderGroupList(moneyFlow.expenditure.topGroups, '#3b82f6')}
              </div>

              {moneyFlow.expenditure.bottomGroups.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Smallest 7 (by share)
                  </div>
                  {renderGroupList(expenditureBottomGroups, '#93c5fd')}
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                    Smallest is relative to the full city budget, so values can still be in the tens of millions.
                  </div>
                </div>
              )}

              {expenditureReconciliation !== null && (
                <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px dashed #d1d5db' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>
                    Reconciliation items (FIR only)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginTop: '4px' }}>
                    {formatSignedCurrency(expenditureReconciliation)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    Not itemized in CKAN line items.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {moneyFlowTab === 'sankey' && (
        <div style={{ marginTop: '16px' }}>
          {!hasFlowData ? (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
              Sankey view needs full line-item detail. Re-run the ETL or refresh the data to enable this view.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Pooled view of line-item revenue and spending. Flows are aggregated and do not imply earmarking.
              </div>
              {displayBalance && (
                <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      backgroundColor: netBackground,
                      border: `1px solid ${netBorder}`,
                      color: netText,
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    {displayBalanceLabel} {displayBalance.isSurplus ? 'surplus' : 'deficit'}:{' '}
                    {formatSignedCurrency(displayBalance.amount)} ({formatPercent(Math.abs(displayBalance.percentageOfRevenue))})
                  </div>
                  {lineItemBalance && (
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        backgroundColor: lineItemNetBackground,
                        border: `1px solid ${lineItemNetBorder}`,
                        color: lineItemNetText,
                        fontSize: '10px',
                        fontWeight: 600
                      }}
                    >
                      Line-item net (CKAN): {formatSignedCurrency(lineItemBalance.amount)}{' '}
                      ({formatPercent(Math.abs(lineItemBalance.percentageOfRevenue))})
                    </div>
                  )}
                </div>
              )}
              <MoneyFlowSankey
                revenueBuckets={revenueFlow.buckets}
                expenseBuckets={expenseFlow.buckets}
                balanceAmount={lineItemBalanceAmount}
                year={year}
                onSelectBucket={handleSankeySelectBucket}
                selectedBucketId={flowSelection?.bucketId}
              />
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#6b7280' }}>
                Sankey uses named line items only; reconciliation adjustments are excluded.
              </div>

              {/* Drill-down panel for Sankey */}
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                {renderBucketDrillDown()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default MoneyFlowSection
