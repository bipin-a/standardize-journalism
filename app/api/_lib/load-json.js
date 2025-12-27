import { readFile } from 'fs/promises'
import { join } from 'path'

export const loadJsonData = async ({
  url,
  envKey,
  localPath,
  goldEnvKey,
  goldLocalPath,
  revalidateSeconds,
  cacheMode = 'revalidate'
}) => {
  // Try gold tier first (pre-aggregated summaries)
  if (goldEnvKey || goldLocalPath) {
    try {
      const goldUrl = goldEnvKey ? process.env[goldEnvKey] : null

      if (goldUrl) {
        const fetchOptions = { next: { revalidate: revalidateSeconds } }
        const response = await fetch(goldUrl, fetchOptions)
        if (response.ok) {
          return response.json()
        }
      }

      if (goldLocalPath) {
        const fileContent = await readFile(join(process.cwd(), goldLocalPath), 'utf-8')
        return JSON.parse(fileContent)
      }
    } catch (error) {
      console.warn(`Gold data unavailable (${goldEnvKey || goldLocalPath}), falling back to processed:`, error.message)
    }
  }

  // Fallback to processed tier (full datasets with runtime aggregation)
  const resolvedUrl = url || (envKey ? process.env[envKey] : null)
  if (resolvedUrl) {
    const fetchOptions = cacheMode === 'no-store'
      ? { cache: 'no-store' }
      : { next: { revalidate: revalidateSeconds } }
    const response = await fetch(resolvedUrl, fetchOptions)
    if (!response.ok) {
      throw new Error(`Failed to fetch data from ${resolvedUrl}: ${response.statusText}`)
    }
    return response.json()
  }

  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}
