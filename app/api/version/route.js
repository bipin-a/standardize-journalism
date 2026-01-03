import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

const DEFAULT_VERSION = 'dev'

export async function GET() {
  let version = DEFAULT_VERSION
  try {
    const content = await readFile(join(process.cwd(), '.VERSION'), 'utf-8')
    version = content.trim() || DEFAULT_VERSION
  } catch (error) {
    console.warn('Version file not found:', error.message)
  }

  return NextResponse.json({ version })
}
