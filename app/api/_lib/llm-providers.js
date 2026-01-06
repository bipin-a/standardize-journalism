// LLM Provider Abstraction Layer
// Supports: Anthropic Claude, OpenAI GPT
// Easy to add new providers without changing chat API

/**
 * Anthropic Claude Provider
 * Uses Claude 3.5 Sonnet by default
 */
const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) return []
  return history
    .filter((item) => item && typeof item.content === 'string' && ['user', 'assistant'].includes(item.role))
    .map((item) => ({
      role: item.role,
      content: item.content
    }))
}

class AnthropicProvider {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
    this.modelName = 'Claude 3.5 Sonnet'

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
  }

  async chat({ systemPrompt, context, message, history = [] }) {
    try {
      const priorMessages = normalizeHistory(history)
      const userContent = context
        ? `Context:\n${context}\n\nQuestion: ${message}`
        : `Question: ${message}`
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          temperature: 0.3, // Lower temperature for factual responses
          system: systemPrompt,
          messages: [
            ...priorMessages,
            {
              role: 'user',
              content: userContent
            }
          ]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      return {
        answer: data.content[0].text,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens
        }
      }
    } catch (error) {
      console.error('Anthropic provider error:', error)
      throw error
    }
  }
}

/**
 * OpenAI GPT Provider
 * Uses GPT-4o-mini by default (cost-effective)
 */
class OpenAIProvider {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    this.modelName = 'GPT-4o Mini'

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
  }

  async chat({ systemPrompt, context, message, history = [] }) {
    try {
      const priorMessages = normalizeHistory(history)
      const userContent = context
        ? `Context:\n${context}\n\nQuestion: ${message}`
        : `Question: ${message}`
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            ...priorMessages,
            {
              role: 'user',
              content: userContent
            }
          ]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      return {
        answer: data.choices[0].message.content,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens
        }
      }
    } catch (error) {
      console.error('OpenAI provider error:', error)
      throw error
    }
  }
}

const PROVIDER_MAP = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider
}

export function getLLMProvider() {
  const providerName = process.env.LLM_PROVIDER || 'anthropic'
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    throw new Error(`Unknown LLM provider: ${providerName}. Supported: ${Object.keys(PROVIDER_MAP).join(', ')}`)
  }

  return new ProviderClass()
}
