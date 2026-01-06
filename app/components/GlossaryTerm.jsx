'use client'

const GlossaryTerm = ({
  term,
  entry,
  activeGlossaryId,
  setActiveGlossaryId,
  closeTimeoutRef,
  glossaryPath = '/about'
}) => {
  const isOpen = activeGlossaryId === entry.id

  const handleOpen = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setActiveGlossaryId(entry.id)
  }

  const handleClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    closeTimeoutRef.current = setTimeout(() => {
      setActiveGlossaryId((current) => (current === entry.id ? null : current))
      closeTimeoutRef.current = null
    }, 200)
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
    >
      <span>{term}</span>
      <span style={{ fontSize: '10px', color: '#9ca3af' }}>?</span>
      {isOpen && (
        <span
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '6px',
            padding: '10px',
            backgroundColor: '#111827',
            color: '#f9fafb',
            borderRadius: '6px',
            width: '240px',
            fontSize: '11px',
            lineHeight: '1.5',
            zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            pointerEvents: 'auto'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>{entry.term}</div>
          <div>{entry.definition}</div>
          <div style={{ marginTop: '6px' }}>
            <a
              href={`${glossaryPath}#glossary-${entry.id}`}
              style={{ color: '#93c5fd', textDecoration: 'underline' }}
            >
              View glossary
            </a>
          </div>
        </span>
      )}
    </span>
  )
}

export default GlossaryTerm
