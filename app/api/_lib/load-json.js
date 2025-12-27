import { readFile } from 'fs/promises'
import { join } from 'path'

export const loadJsonData = async ({
  envKey,
  localPath,
  revalidateSeconds,
  cacheMode = 'revalidate'
}) => {
  const url = process.env[envKey]
  if (url) {
    const fetchOptions = cacheMode === 'no-store'
      ? { cache: 'no-store' }
      : { next: { revalidate: revalidateSeconds } }
    const response = await fetch(url, fetchOptions)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${envKey} from ${url}: ${response.statusText}`)
    }
    return response.json()
  }

  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}
