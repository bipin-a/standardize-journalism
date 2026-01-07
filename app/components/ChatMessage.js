// ChatMessage Component - Individual message bubble
// Displays user questions and assistant answers with sources

const buildSourceLabel = (source) => {
  const label = source.type || 'Source'
  if (source.year) {
    return `${label} (${source.year})`
  }
  if (Array.isArray(source.years) && source.years.length) {
    return `${label} (${source.years.join(', ')})`
  }
  return label
}

const getSourcePaths = (source) => {
  if (Array.isArray(source.paths) && source.paths.length) {
    return source.paths.filter(Boolean)
  }
  if (source.path) {
    return [source.path]
  }
  return []
}

const shortenUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('/')) return path
  if (!path.startsWith('http')) return path
  try {
    const url = new URL(path)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length <= 2) {
      return `${url.hostname}/${parts.join('/')}`
    }
    const tail = parts.slice(-2).join('/')
    return `${url.hostname}/.../${tail}`
  } catch (error) {
    return path
  }
}

const buildMethodLabel = (metadata) => {
  if (!metadata) return null
  if (metadata.retrievalType === 'tool') {
    return 'Method: Deterministic tool'
  }
  if (metadata.retrievalType === 'rag') {
    return metadata.ragStrategy ? `Method: RAG (${metadata.ragStrategy})` : 'Method: RAG'
  }
  return null
}

const checkFallbackData = (metadata) => {
  if (!metadata?.dataSources) return null
  const fallbacks = metadata.dataSources.filter(ds => ds?.fallback === true)
  if (fallbacks.length === 0) return null
  return {
    count: fallbacks.length,
    total: metadata.dataSources.length,
    labels: fallbacks.map(ds => ds.label || ds.year || 'unknown').filter(Boolean)
  }
}

export default function ChatMessage({ message, isUser, sources = [], isLoading = false, metadata = null }) {
  if (isLoading) {
    return (
      <div style={styles.messageWrapper}>
        <div style={{ ...styles.message, ...styles.assistantMessage }}>
          <div style={styles.loadingContainer}>
            <div style={styles.loadingDot}></div>
            <div style={{ ...styles.loadingDot, animationDelay: '0.2s' }}></div>
            <div style={{ ...styles.loadingDot, animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    )
  }

  const methodLabel = !isUser ? buildMethodLabel(metadata) : null
  const fallbackInfo = !isUser ? checkFallbackData(metadata) : null

  return (
    <div style={styles.messageWrapper}>
      <div style={{
        ...styles.message,
        ...(isUser ? styles.userMessage : styles.assistantMessage)
      }}>
        <div style={styles.messageText}>
          {message}
        </div>

        {/* Fallback data warning badge */}
        {fallbackInfo && (
          <div style={styles.fallbackBadge} title={`Using cached data: ${fallbackInfo.labels.join(', ')}`}>
            <span style={styles.fallbackIcon}>⚠️</span>
            <span>Using cached data{fallbackInfo.count > 1 ? ` (${fallbackInfo.count} sources)` : ''}</span>
          </div>
        )}

        {methodLabel && (
          <div style={styles.methodBadge}>
            {methodLabel}
          </div>
        )}

        {/* Show sources for assistant messages */}
        {!isUser && sources && sources.length > 0 && (
          <div style={styles.sourcesContainer}>
            <div style={styles.sourcesLabel}>Sources:</div>
            {sources.map((source, idx) => {
              const label = buildSourceLabel(source)
              const paths = getSourcePaths(source)
              if (paths.length === 0) {
                return (
                  <div key={idx} style={styles.source}>
                    <span style={styles.sourceIcon}>📊</span>
                    <span style={styles.sourceText}>{label}</span>
                  </div>
                )
              }
              if (paths.length === 1) {
                const shortPath = shortenUrl(paths[0])
                const linkText = shortPath ? `${label} (${shortPath})` : label
                return (
                  <div key={idx} style={styles.source}>
                    <span style={styles.sourceIcon}>📊</span>
                    <a
                      href={paths[0]}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.sourceLink}
                    >
                      {linkText}
                    </a>
                  </div>
                )
              }
              return (
                <div key={idx} style={styles.source}>
                  <span style={styles.sourceIcon}>📊</span>
                  <span style={styles.sourceText}>{label}</span>
                  {paths.map((path, pathIndex) => (
                    <a
                      key={`${idx}-${pathIndex}`}
                      href={path}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.sourceLink}
                    >
                      file {pathIndex + 1} ({shortenUrl(path)})
                    </a>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Timestamp (optional, subtle) */}
      <div style={styles.timestamp}>
        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

const styles = {
  messageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '16px'
  },

  message: {
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
    wordWrap: 'break-word',
    fontSize: '14px',
    lineHeight: '1.5'
  },

  userMessage: {
    backgroundColor: '#3b82f6',
    color: 'white',
    marginLeft: 'auto',
    borderBottomRightRadius: '4px'
  },

  assistantMessage: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    marginRight: 'auto',
    borderBottomLeftRadius: '4px'
  },

  messageText: {
    margin: 0
  },

  fallbackBadge: {
    marginTop: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: '500',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '6px',
    padding: '4px 8px',
    width: 'fit-content'
  },

  fallbackIcon: {
    fontSize: '12px'
  },

  sourcesContainer: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },

  sourcesLabel: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: '0.5px'
  },

  methodBadge: {
    marginTop: '10px',
    alignSelf: 'flex-start',
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: '#6b7280',
    backgroundColor: '#e5e7eb',
    borderRadius: '999px',
    padding: '2px 8px',
    width: 'fit-content'
  },

  source: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#4b5563'
  },

  sourceIcon: {
    fontSize: '12px'
  },

  sourceText: {
    fontWeight: '500'
  },
  sourceLink: {
    fontWeight: '500',
    color: '#2563eb',
    textDecoration: 'underline'
  },

  timestamp: {
    fontSize: '11px',
    color: '#9ca3af',
    marginLeft: '8px',
    alignSelf: 'flex-start'
  },

  loadingContainer: {
    display: 'flex',
    gap: '6px',
    padding: '4px 0'
  },

  loadingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#9ca3af',
    animation: 'bounce 1.4s infinite ease-in-out both'
  }
}

// Add CSS animation for loading dots (injected once)
if (typeof window !== 'undefined' && !document.getElementById('chat-animations')) {
  const style = document.createElement('style')
  style.id = 'chat-animations'
  style.textContent = `
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  `
  document.head.appendChild(style)
}
