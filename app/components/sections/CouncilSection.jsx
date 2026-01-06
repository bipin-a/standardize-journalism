'use client'

import { getCategoryLabel } from '../../utils/labels'

const CouncilSection = ({ year, councilData, loading, error }) => {
  if (loading) {
    return (
      <div style={{ padding: '32px 20px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
        Loading council decisions...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '32px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
        Council data unavailable: {error}
      </div>
    )
  }

  if (!councilData) {
    return null
  }

  const recentDecisions = councilData.recent_decisions || []
  const decisionCategories = councilData.decision_categories || []
  const maxPassRate = decisionCategories.length
    ? Math.max(...decisionCategories.map((cat) => cat.pass_rate))
    : 0

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
          Section 5: Council Decisions
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          Year: {year}
        </div>
      </div>

      {councilData.timestamp && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '16px' }}>
          Last updated: {new Date(councilData.timestamp).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '48px', fontWeight: 700, color: '#111827', lineHeight: '1' }}>
          {councilData.metadata.total_motions}
        </div>
        <div style={{ fontSize: '15px', color: '#6b7280', marginTop: '8px' }}>
          motions voted on in the past year ({councilData.metadata.pass_rate}% passed)
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
          Recent Decisions
        </div>
        {recentDecisions.slice(0, 10).map((decision, idx) => (
          <div key={decision.motion_id || idx} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px' }}>
                  {decision.motion_id && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>
                      {decision.motion_id}
                    </span>
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                    {decision.motion_title}
                  </span>
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

      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
          Decisions by Category
        </div>
        {decisionCategories.slice(0, 7).map((cat) => {
          const widthPercent = maxPassRate > 0 ? (cat.pass_rate / maxPassRate) * 100 : 0

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

      <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', marginTop: '24px' }}>
        <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
          This section shows recent decisions made by Toronto City Council. Each motion is voted on by councillors (Yes, No, or Absent). A motion passes when it receives a majority of Yes votes. Lobbyist activity shows who is attempting to influence decisions—it does not indicate that lobbying caused specific outcomes, only that influence attempts occurred.
        </div>
      </div>
    </div>
  )
}

export default CouncilSection
