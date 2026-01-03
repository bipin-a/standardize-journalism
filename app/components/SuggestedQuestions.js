// SuggestedQuestions Component - Clickable question chips
// Helps users get started with meaningful questions

const SUGGESTED_QUESTIONS = [
  "What was Toronto's biggest expense in 2024?",
  "Which ward got the most capital funding?",
  "How much did the city spend on transit?",
  "What was the budget surplus or deficit?",
  "What decisions did council make recently?",
  "How much was spent on police?"
]

export default function SuggestedQuestions({ onQuestionClick, disabled = false }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>💡</span>
        <span style={styles.headerText}>Try asking:</span>
      </div>

      <div style={styles.questionsGrid}>
        {SUGGESTED_QUESTIONS.map((question, idx) => (
          <button
            key={idx}
            onClick={() => !disabled && onQuestionClick(question)}
            disabled={disabled}
            style={{
              ...styles.questionChip,
              ...(disabled ? styles.questionChipDisabled : styles.questionChipEnabled)
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.target.style.backgroundColor = '#eff6ff'
                e.target.style.borderColor = '#3b82f6'
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.target.style.backgroundColor = 'white'
                e.target.style.borderColor = '#e5e7eb'
              }
            }}
          >
            <span style={styles.questionText}>{question}</span>
            <span style={styles.questionIcon}>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px'
  },

  headerIcon: {
    fontSize: '16px'
  },

  headerText: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563'
  },

  questionsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },

  questionChip: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '13px',
    textAlign: 'left',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    fontFamily: 'inherit'
  },

  questionChipEnabled: {
    cursor: 'pointer'
  },

  questionChipDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5
  },

  questionText: {
    flex: 1,
    color: '#374151',
    lineHeight: '1.4'
  },

  questionIcon: {
    color: '#9ca3af',
    fontSize: '16px',
    marginLeft: '8px',
    transition: 'transform 0.2s ease'
  }
}
