const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

/**
 * Send a standard (non-streaming) chat completion request.
 * Returns the assistant content string.
 * @param {object} params
 * @param {Array}  params.messages      - Full conversation history
 * @param {string} params.model
 * @param {number} params.temperature
 * @param {number} params.maxTokens
 * @param {string} params.token
 */
export async function sendChatCompletion({ messages, model, temperature, maxTokens, systemPrompt, token }) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      model,
      temperature,
      max_tokens: maxTokens,
      system_prompt: systemPrompt || null,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(errorData.detail || `HTTP ${response.status}`)
  }

  const data = await response.json()
  return data.content
}

/**
 * Send a streaming chat completion request.
 * Calls onDelta(tokenText) for each received token, then onDone() when finished.
 * Calls onError(errorMessage) if something fails.
 * @param {object}   params
 * @param {Array}    params.messages
 * @param {string}   params.model
 * @param {number}   params.temperature
 * @param {number}   params.maxTokens
 * @param {string}   [params.systemPrompt]
 * @param {Function} params.onDelta
 * @param {Function} params.onDone
 * @param {Function} params.onError
 */
export async function sendChatStream({ messages, model, temperature, maxTokens, systemPrompt, token, onDelta, onDone, onError }) {
  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt || null,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (raw === '[DONE]') { onDone(); return }

        try {
          const parsed = JSON.parse(raw)
          if (parsed.error) { onError(parsed.error); return }
          if (parsed.delta) onDelta(parsed.delta)
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    onDone()
  } catch (err) {
    onError(err.message || 'Network error')
  }
}
