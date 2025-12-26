import { readFile } from 'fs/promises'
import { join } from 'path'

export const loadJsonData = async ({ envKey, localPath, revalidateSeconds }) => {
  const url = process.env[envKey]
  if (url) {
    const response = await fetch(url, { next: { revalidate: revalidateSeconds } })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${envKey} from ${url}: ${response.statusText}`)
    }
    return response.json()
  }

  const fileContent = await readFile(join(process.cwd(), localPath), 'utf-8')
  return JSON.parse(fileContent)
}
