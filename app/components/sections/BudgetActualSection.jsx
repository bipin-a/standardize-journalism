'use client'

import { useEffect, useState } from 'react'
import {
  formatCompactCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent
} from '../../utils/formatters'

const VARIANCE_PDF_LINKS = {
  operating: {
    2021: 'https://www.toronto.ca/legdocs/mmis/2022/ex/bgrd/backgroundfile-228258.pdf',
    2022: 'https://www.toronto.ca/legdocs/mmis/2023/ex/bgrd/backgroundfile-237914.pdf',
    2023: 'https://www.toronto.ca/legdocs/mmis/2024/ex/bgrd/backgroundfile-247403.pdf',
    2024: 'https://www.toronto.ca/legdocs/mmis/2025/ex/bgrd/backgroundfile-257057.pdf'
  },
  capital: {
    2021: 'https://www.toronto.ca/legdocs/mmis/2022/ex/bgrd/backgroundfile-228039.pdf',
    2022: 'https://www.toronto.ca/legdocs/mmis/2023/ex/bgrd/backgroundfile-237833.pdf',
    2023: 'https://www.toronto.ca/legdocs/mmis/2024/ex/bgrd/backgroundfile-247343.pdf',
    2024: 'https://www.toronto.ca/legdocs/mmis/2025/ex/bgrd/backgroundfile-257072.pdf'
  }
}

const BudgetActualSection = ({ year, budgetActual, loading, error }) => {
  const [showAllBudgetCategories, setShowAllBudgetCategories] = useState(false)

  useEffect(() => {
    setShowAllBudgetCategories(false)
  }, [year])

  return (
    <div style={{ padding: '32px 20px' }}>
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
        Section 6: Budget vs Actual Spending
      </div>

      <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
        City-wide Budget vs Actual (Open Data)
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', marginBottom: '16px' }}>
        Planned (Operating Budget) vs actual (FIR), city-wide only.
      </div>

      {loading && (
        <div style={{ padding: '16px', color: '#6b7280', fontSize: '14px' }}>
          Loading budget vs actual...
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
          Budget vs actual data unavailable: {error}
        </div>
      )}

      {budgetActual && (
        (() => {
          const variancePct = budgetActual.variancePct ?? 0
          const varianceBarWidth = Math.min(50, Math.abs(variancePct))
          const isOverspend = variancePct > 0
          const rawCategories = budgetActual.categories || []
          const validCategories = rawCategories.filter((item) => (item.planned || 0) > 0)
          const excludedCategories = rawCategories.filter((item) => (item.planned || 0) <= 0)
          const categoryByName = new Map(validCategories.map((item) => [item.name, item]))
          const groupConfig = [
            { name: 'Public Safety', items: ['Police', 'Fire', 'Paramedic'] },
            { name: 'Infrastructure', items: ['Transit', 'Roads & Traffic', 'Water'] },
            { name: 'Community & Social', items: ['Public Health', 'Parks & Recreation', 'Housing & Shelter', 'Libraries'] },
            { name: 'Operations & Corporate', items: ['Solid Waste', 'Corporate & Governance'] }
          ]
          const usedNames = new Set()
          const groupedCategories = groupConfig.map((group) => {
            const items = group.items
              .map((name) => categoryByName.get(name))
              .filter(Boolean)
              .sort((a, b) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
            items.forEach((item) => usedNames.add(item.name))
            const planned = items.reduce((sum, item) => sum + (item.planned || 0), 0)
            const actual = items.reduce((sum, item) => sum + (item.actual || 0), 0)
            const variance = actual - planned
            const variancePct = planned > 0 ? (variance / planned) * 100 : null
            return { name: group.name, items, planned, actual, variance, variancePct }
          })
            .filter((group) => group.items.length > 0)
            .sort((a, b) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
          const otherItems = validCategories
            .filter((item) => !usedNames.has(item.name))
            .sort((a, b) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
          const maxVarianceValue = Math.max(
            ...validCategories.map((item) => Math.abs(item.variance || 0)),
            1
          )
          const overspendGroup = groupedCategories
            .filter((group) => (group.variance ?? 0) > 0)
            .sort((a, b) => (b.variance ?? 0) - (a.variance ?? 0))[0]
          const underspendGroup = groupedCategories
            .filter((group) => (group.variance ?? 0) < 0)
            .sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0))[0]
          const coverage = budgetActual.categoryCoverage

          const renderVarianceRow = (item) => {
            const plannedValue = item.planned || 0
            const actualValue = item.actual || 0
            const varianceValue = item.variance ?? 0
            const widthPercent = (Math.abs(varianceValue) / maxVarianceValue) * 100
            const overspend = varianceValue > 0
            const barColor = overspend ? '#dc2626' : '#16a34a'
            const isMappingGap = plannedValue > 0 && actualValue === 0

            return (
              <div key={item.name} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 150px', gap: '10px', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{item.name}</span>
                    {isMappingGap && <span title="Actuals likely mapped elsewhere">⚠️</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f5f9', borderRadius: '999px', padding: '2px 0' }}>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      {!overspend && (
                        <div
                          style={{
                            width: `${widthPercent}%`,
                            height: '8px',
                            backgroundColor: barColor,
                            borderRadius: '999px',
                            marginLeft: 'auto'
                          }}
                        />
                      )}
                    </div>
                    <div style={{ width: '2px', height: '12px', backgroundColor: '#cbd5f5' }} />
                    <div style={{ flex: 1 }}>
                      {overspend && (
                        <div
                          style={{
                            width: `${widthPercent}%`,
                            height: '8px',
                            backgroundColor: barColor,
                            borderRadius: '999px'
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: barColor, fontWeight: 600, textAlign: 'right' }}>
                    {formatSignedCurrency(varianceValue)}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginTop: '4px', marginLeft: '170px' }}>
                  <span>Planned {formatCompactCurrency(plannedValue)}</span>
                  <span>Actual {formatCompactCurrency(actualValue)}</span>
                  <span>{formatSignedPercent(item.variancePct)}</span>
                </div>
              </div>
            )
          }

          return (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Planned (Operating Budget {budgetActual.plannedYear || year})
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '6px' }}>
                    {formatCompactCurrency(budgetActual.plannedTotal)}
                  </div>
                </div>
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Actual (FIR {budgetActual.actualYear || year})
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '6px' }}>
                    {formatCompactCurrency(budgetActual.actualTotal)}
                  </div>
                </div>
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Variance
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '6px' }}>
                    {formatSignedCurrency(budgetActual.variance)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {formatSignedPercent(budgetActual.variancePct)}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                  Overall variance (underspend left, overspend right)
                </div>
                <div style={{ position: 'relative', height: '10px', backgroundColor: '#e5e7eb', borderRadius: '999px' }}>
                  <div style={{ position: 'absolute', left: '50%', top: 0, height: '100%', width: '1px', backgroundColor: '#94a3b8' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      height: '100%',
                      backgroundColor: isOverspend ? '#dc2626' : '#16a34a',
                      borderRadius: '999px',
                      width: `${varianceBarWidth}%`,
                      ...(isOverspend ? { left: '50%' } : { right: '50%' })
                    }}
                  />
                </div>
              </div>

              {(budgetActual.plannedFellBack || budgetActual.actualFellBack) && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280' }}>
                  Using planned year {budgetActual.plannedYear} and actual year {budgetActual.actualYear} (closest available).
                </div>
              )}

              {coverage && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
                  Mapped categories cover {formatPercent(coverage.plannedPct)} of planned spend and {formatPercent(coverage.actualPct)} of actuals.
                </div>
              )}

              {(overspendGroup || underspendGroup) && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#334155' }}>
                  {overspendGroup && (
                    <div>
                      Biggest overspend: <strong>{overspendGroup.name}</strong> at {formatSignedCurrency(overspendGroup.variance)} ({formatSignedPercent(overspendGroup.variancePct)}).
                    </div>
                  )}
                  {underspendGroup && (
                    <div style={{ marginTop: overspendGroup ? '6px' : 0 }}>
                      Biggest underspend: <strong>{underspendGroup.name}</strong> at {formatSignedCurrency(underspendGroup.variance)} ({formatSignedPercent(underspendGroup.variancePct)}).
                    </div>
                  )}
                </div>
              )}

              {validCategories.length > 0 && (
                <div style={{ marginTop: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                    Variance by Category (overspend right, underspend left)
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    Scale: max variance {formatSignedCurrency(maxVarianceValue)}.
                  </div>
                  {excludedCategories.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                      Excluding {excludedCategories.length} categories with zero planned spend (likely mapping gaps).
                    </div>
                  )}

                  {groupedCategories.map((group) => {
                    const groupColor = (group.variance || 0) > 0 ? '#dc2626' : '#16a34a'

                    return (
                      <div key={group.name} style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#111827', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 700 }}>{group.name}</span>
                          <span style={{ color: groupColor, fontWeight: 600 }}>
                            {formatSignedCurrency(group.variance)} ({formatSignedPercent(group.variancePct)})
                          </span>
                        </div>
                        {group.items.map(renderVarianceRow)}
                      </div>
                    )
                  })}

                  {otherItems.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setShowAllBudgetCategories((prev) => !prev)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          backgroundColor: 'white',
                          fontSize: '12px',
                          cursor: 'pointer',
                          marginBottom: showAllBudgetCategories ? '10px' : 0
                        }}
                      >
                        {showAllBudgetCategories ? 'Hide other categories' : `Show ${otherItems.length} other categories`}
                      </button>
                      {showAllBudgetCategories && (
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
                            Other
                          </div>
                          {otherItems.map(renderVarianceRow)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {budgetActual.capitalRevision && (
                <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>
                    Capital Plan Revisions (Open Data)
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    For {budgetActual.capitalRevision.targetYear}, the plan changed from {budgetActual.capitalRevision.previousPlanYear} to {budgetActual.capitalRevision.latestPlanYear}.
                    Revision: {formatSignedCurrency(budgetActual.capitalRevision.revision)} ({formatSignedPercent(budgetActual.capitalRevision.revisionPct)}).
                  </div>
                </div>
              )}
            </div>
          )
        })()
      )}

      <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
          Program-level Variance Reports (PDF)
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', marginBottom: '12px' }}>
          Toronto publishes program-level variance only as PDF reports. We are not extracting the data, just linking to the source documents.
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>
          Operating variance (year-end)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {Object.entries(VARIANCE_PDF_LINKS.operating).map(([yearKey, url]) => (
            <a
              key={`operating-${yearKey}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'underline' }}
            >
              {yearKey} PDF
            </a>
          ))}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>
          Capital variance (year-end)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {Object.entries(VARIANCE_PDF_LINKS.capital).map(([yearKey, url]) => (
            <a
              key={`capital-${yearKey}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'underline' }}
            >
              {yearKey} PDF
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BudgetActualSection
