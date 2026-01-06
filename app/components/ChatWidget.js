'use client'

// ChatWidget Component - Floating AI Assistant
// Main chat interface with open/close, message handling, API calls

import { useState, useRef, useEffect } from 'react'
import ChatMessage from './ChatMessage'
import SuggestedQuestions from './SuggestedQuestions'

export default function ChatWidget({ mode = 'floating' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId] = useState(() => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const MAX_HISTORY_ITEMS = 8

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [inputValue])

  const handleSendMessage = async (messageText) => {
    const trimmed = messageText.trim()
    if (!trimmed || isLoading) return

    // Clear input and error
    setInputValue('')
    setError(null)

    // Add user message to chat
    const userMessage = {
      id: Date.now(),
      text: trimmed,
      isUser: true,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const history = messages
        .filter((msg) => !msg.isError)
        .slice(-MAX_HISTORY_ITEMS)
        .map((msg) => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text
        }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          history
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle specific error types
        if (data.type === 'RATE_LIMIT') {
          throw new Error(`Whoa, slow down! Please wait ${data.retryAfter} seconds before asking another question.`)
        }
        if (data.type === 'CONFIG_ERROR') {
          throw new Error('Chat is temporarily unavailable. Please try again later.')
        }
        if (data.type === 'TIMEOUT') {
          throw new Error('That took too long. Try asking a simpler question.')
        }
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }

      // Add assistant response to chat
      const assistantMessage = {
        id: Date.now() + 1,
        text: data.answer,
        isUser: false,
        sources: data.sources,
        metadata: data.metadata,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

    } catch (err) {
      console.error('Chat error:', err)
      setError(err.message)

      // Add error message to chat
      const errorMessage = {
        id: Date.now() + 1,
        text: err.message,
        isUser: false,
        isError: true,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSendMessage(inputValue)
  }

  const handleSuggestedQuestion = (question) => {
    handleSendMessage(question)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Floating mode: show toggle button
  if (mode === 'floating' && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={styles.floatingButton}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.05)'
          e.target.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4)'
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)'
          e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}
        aria-label="Open chat"
      >
        <span style={styles.floatingButtonIcon}>💬</span>
        <span style={styles.floatingButtonText}>Ask a question</span>
      </button>
    )
  }

  // Main chat interface
  const containerStyle = mode === 'floating' ? styles.floatingContainer : styles.embeddedContainer

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <span style={styles.headerIcon}>💬</span>
          <div>
            <div style={styles.headerTitle}>Toronto Civic Insights Assistant</div>
            <div style={styles.headerSubtitle}>Ask me about the budget, projects, or council</div>
          </div>
        </div>
        {mode === 'floating' && (
          <button
            onClick={() => setIsOpen(false)}
            style={styles.closeButton}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages area */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && !isLoading && (
          <div style={styles.emptyState}>
            <div style={styles.emptyStateIcon}>👋</div>
            <div style={styles.emptyStateTitle}>Hi there!</div>
            <div style={styles.emptyStateText}>
              I can answer questions about Toronto's budget, capital projects, and council decisions.
              All my answers come from official city data.
            </div>
            <div style={styles.suggestedQuestionsWrapper}>
              <SuggestedQuestions onQuestionClick={handleSuggestedQuestion} disabled={isLoading} />
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg.text}
            isUser={msg.isUser}
            sources={msg.sources}
            metadata={msg.metadata}
          />
        ))}

        {isLoading && <ChatMessage isLoading={true} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={styles.inputContainer}>
        {error && (
          <div style={styles.errorBanner}>
            <span style={styles.errorIcon}>⚠️</span>
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.inputForm}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading}
            maxLength={500}
            rows={1}
            style={styles.input}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            style={{
              ...styles.sendButton,
              ...((!inputValue.trim() || isLoading) ? styles.sendButtonDisabled : styles.sendButtonEnabled)
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim() && !isLoading) {
                e.target.style.backgroundColor = '#2563eb'
              }
            }}
            onMouseLeave={(e) => {
              if (inputValue.trim() && !isLoading) {
                e.target.style.backgroundColor = '#3b82f6'
              }
            }}
            aria-label="Send message"
          >
            <span style={styles.sendIcon}>→</span>
          </button>
        </form>

        <div style={styles.charCounter}>
          {inputValue.length}/500
        </div>
      </div>
    </div>
  )
}

const styles = {
  // Floating button (when closed)
  floatingButton: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '24px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease',
    zIndex: 9999,
    fontFamily: 'inherit'
  },

  floatingButtonIcon: {
    fontSize: '20px'
  },

  floatingButtonText: {
    lineHeight: '1'
  },

  // Container styles
  floatingContainer: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '380px',
    height: '600px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9999,
    overflow: 'hidden'
  },

  embeddedContainer: {
    width: '100%',
    maxWidth: '900px',
    height: '600px',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    margin: '0 auto'
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    borderBottom: '1px solid #2563eb'
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },

  headerIcon: {
    fontSize: '24px'
  },

  headerTitle: {
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '1.2'
  },

  headerSubtitle: {
    fontSize: '12px',
    opacity: 0.9,
    marginTop: '2px'
  },

  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background-color 0.2s ease',
    fontFamily: 'inherit'
  },

  // Messages area
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    backgroundColor: '#fafafa'
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    paddingTop: '40px'
  },

  emptyStateIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },

  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px'
  },

  emptyStateText: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
    maxWidth: '280px',
    marginBottom: '24px'
  },

  suggestedQuestionsWrapper: {
    width: '100%',
    maxWidth: '340px'
  },

  // Input area
  inputContainer: {
    padding: '16px',
    backgroundColor: 'white',
    borderTop: '1px solid #e5e7eb'
  },

  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    marginBottom: '12px'
  },

  errorIcon: {
    fontSize: '16px'
  },

  errorText: {
    fontSize: '13px',
    color: '#dc2626',
    flex: 1,
    lineHeight: '1.4'
  },

  inputForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px'
  },

  input: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s ease, height 0.1s ease',
    resize: 'none',
    overflow: 'hidden',
    minHeight: '44px',
    maxHeight: '120px',
    lineHeight: '1.4'
  },

  sendButton: {
    width: '44px',
    height: '44px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit'
  },

  sendButtonEnabled: {
    backgroundColor: '#3b82f6',
    color: 'white'
  },

  sendButtonDisabled: {
    backgroundColor: '#e5e7eb',
    color: '#9ca3af',
    cursor: 'not-allowed'
  },

  sendIcon: {
    fontSize: '20px',
    fontWeight: 'bold'
  },

  charCounter: {
    fontSize: '11px',
    color: '#9ca3af',
    textAlign: 'right'
  }
}
