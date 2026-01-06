// Simple debug utility - no-op in production
export function createDebug(namespace) {
  return function debug(...args) {
    // Only log in development if DEBUG env var is set
    if (process.env.DEBUG && process.env.NODE_ENV === 'development') {
      console.log(`[${namespace}]`, ...args)
    }
  }
}
