import { useEffect, useMemo, useState } from 'react'

const buildUrl = (endpoint, params) => {
  if (!params || Object.keys(params).length === 0) {
    return endpoint
  }
  const searchParams = new URLSearchParams(params)
  return `${endpoint}?${searchParams.toString()}`
}

export const useApiData = (endpoint, params = {}, options = {}) => {
  const { enabled = true, transform } = options
  const paramsKey = JSON.stringify(params ?? {})
  const url = useMemo(() => buildUrl(endpoint, params), [endpoint, paramsKey])
  const [state, setState] = useState({
    data: null,
    loading: Boolean(enabled),
    error: null,
    meta: null
  })

  useEffect(() => {
    if (!enabled || !endpoint) {
      return
    }

    const controller = new AbortController()
    let isActive = true

    setState((prev) => ({
      data: prev.data,
      loading: true,
      error: null,
      meta: null
    }))

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const payload = await res.json().catch(() => null)
        return { ok: res.ok, data: payload }
      })
      .then(({ ok, data }) => {
        if (!isActive) {
          return
        }

        if (transform) {
          const result = transform({ ok, data }) || {}
          if (result.error) {
            setState({ data: null, loading: false, error: result.error, meta: result.meta ?? null })
            return
          }
          setState({ data: result.data ?? null, loading: false, error: null, meta: result.meta ?? null })
          return
        }

        if (!ok || data?.error) {
          setState({
            data: null,
            loading: false,
            error: data?.error || 'Request failed',
            meta: null
          })
          return
        }

        setState({ data, loading: false, error: null, meta: null })
      })
      .catch((err) => {
        if (!isActive || err.name === 'AbortError') {
          return
        }
        setState({ data: null, loading: false, error: err.message, meta: null })
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [endpoint, enabled, transform, url, paramsKey])

  return state
}
